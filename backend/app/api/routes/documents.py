import asyncio
import csv
import io
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, File, UploadFile, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.redis_client import get_async_redis, get_pubsub_channel, get_cached_job_status
from app.models.models import JobStatus, Job
from app.schemas.schemas import (
    UploadResponse, JobListResponse, JobResponse,
    ResultUpdateRequest, ResultResponse,
    FinalizeRequest,
)
from app.services.document_service import DocumentService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document. Returns immediately with job_id. Processing is async."""
    document, job = await DocumentService.upload_document(file, db)
    return UploadResponse(
        document_id=document.id,
        job_id=job.id,
        filename=document.original_filename,
        status=job.status,
        message="Document queued for processing",
    )


@router.post("/upload/bulk", status_code=201)
async def upload_multiple(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload multiple documents at once."""
    results = []
    errors = []
    for file in files:
        try:
            document, job = await DocumentService.upload_document(file, db)
            results.append(UploadResponse(
                document_id=document.id,
                job_id=job.id,
                filename=document.original_filename,
                status=job.status,
                message="Queued",
            ))
        except HTTPException as e:
            errors.append({"filename": file.filename, "error": e.detail})

    return {"uploaded": results, "errors": errors}


# ── Jobs list & detail ────────────────────────────────────────────────────────

@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: JobStatus | None = Query(None),
    search: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    return await DocumentService.list_jobs(
        db, page, page_size, status, search, sort_by, sort_dir
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    job = await DocumentService.get_job_detail(jid, db)
    return job


# ── SSE Progress stream ───────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/progress")
async def stream_progress(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Server-Sent Events endpoint.

    Supports two modes controlled by settings.sse_mode:

    "pubsub" — subscribes to Redis Pub/Sub channel (fast, requires real Redis).
               Use this locally or with Upstash Redis.

    "poll"   — polls the DB every ~1.5 s and reads the cached Redis key written
               by the Celery worker. Works on Render free Redis which blocks
               SUBSCRIBE/PUBLISH.

    Both modes respect settings.sse_timeout (default 75 s) to stay under
    Render's 90-second proxy hard-kill limit.
    """
    import uuid
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    terminal_events = {"job_completed", "job_failed", "job_cancelled"}
    timeout = settings.sse_timeout  # 75 s — safe under Render's 90 s limit

    # ── Helper: emit an SSE data line ─────────────────────────────────────
    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    # ── Mode A: Redis Pub/Sub ─────────────────────────────────────────────
    async def pubsub_generator() -> AsyncGenerator[str, None]:
        redis = await get_async_redis()
        pubsub = redis.pubsub()
        channel = get_pubsub_channel(job_id)
        try:
            await pubsub.subscribe(channel)
        except Exception as e:
            logger.warning("Pub/Sub subscribe failed (%s) — falling back to poll", e)
            await pubsub.close()
            await redis.aclose()
            # Yield nothing — caller should switch to poll_generator
            return

        elapsed = 0
        try:
            while elapsed < timeout:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    data = message["data"]
                    yield f"data: {data}\n\n"
                    try:
                        parsed = json.loads(data)
                        if parsed.get("event") in terminal_events:
                            break
                    except json.JSONDecodeError:
                        pass
                else:
                    elapsed += 1
                    if elapsed % 15 == 0:
                        yield ": ping\n\n"
                await asyncio.sleep(0)
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
                await redis.aclose()
            except Exception:
                pass

    # ── Mode B: DB polling (works on Render free Redis) ───────────────────
    async def poll_generator() -> AsyncGenerator[str, None]:
        """
        Every poll_interval seconds:
        1. Read cached Redis key written by Celery worker (fastest path).
        2. Fall back to a lightweight DB query if cache is empty.
        Sends the event as an SSE message.
        """
        poll_interval = settings.sse_poll_interval  # 1.5 s
        elapsed = 0.0
        last_event: str | None = None
        last_progress: int = -1
        ping_counter = 0

        redis = None
        try:
            redis = await get_async_redis()
        except Exception:
            pass

        while elapsed < timeout:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            ping_counter += 1

            event_payload: dict | None = None

            # 1. Try Redis cache first (O(1), written by worker on every stage)
            if redis:
                try:
                    event_payload = await get_cached_job_status(redis, job_id)
                except Exception:
                    pass

            # 2. Fall back to DB query
            if not event_payload:
                try:
                    result = await db.execute(
                        select(Job).where(Job.id == job_id)  # type: ignore[arg-type]
                    )
                    job_row = result.scalar_one_or_none()
                    if job_row:
                        event_name = (
                            "job_completed" if job_row.status == JobStatus.COMPLETED
                            else "job_failed" if job_row.status == JobStatus.FAILED
                            else "job_cancelled" if job_row.status == JobStatus.CANCELLED
                            else "job_progress"
                        )
                        event_payload = {
                            "job_id": job_id,
                            "event": event_name,
                            "progress": job_row.progress,
                            "stage": job_row.current_stage,
                            "message": job_row.error_message or "",
                            "timestamp": job_row.updated_at.isoformat(),
                        }
                except Exception as e:
                    logger.warning("Poll DB query failed: %s", e)

            # Only emit if something changed (avoid duplicate events)
            if event_payload:
                new_event = event_payload.get("event", "")
                new_progress = event_payload.get("progress", -1)

                if new_event != last_event or new_progress != last_progress:
                    last_event = new_event
                    last_progress = new_progress
                    yield _sse(event_payload)

                if new_event in terminal_events:
                    break
            else:
                # Send keepalive ping every ~15 s so Render doesn't kill idle SSE
                if ping_counter % max(1, int(15 / poll_interval)) == 0:
                    yield ": ping\n\n"

        if redis:
            try:
                await redis.aclose()
            except Exception:
                pass

    # ── Select generator based on config ─────────────────────────────────
    if settings.sse_mode == "pubsub":
        generator = pubsub_generator()
    else:
        generator = poll_generator()

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Retry ─────────────────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    job = await DocumentService.retry_job(jid, db)
    return job


# ── Result edit & finalize ────────────────────────────────────────────────────

@router.patch("/jobs/{job_id}/result", response_model=ResultResponse)
async def update_result(
    job_id: str,
    update: ResultUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    result = await DocumentService.update_result(jid, update, db)
    return result


@router.post("/jobs/{job_id}/finalize", response_model=ResultResponse)
async def finalize_result(
    job_id: str,
    _: FinalizeRequest,
    db: AsyncSession = Depends(get_db),
):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    result = await DocumentService.finalize_result(jid, db)
    return result


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export/json")
async def export_json(
    finalized_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    records = await DocumentService.get_export_data(db, finalized_only)
    data = [r.model_dump() for r in records]
    content = json.dumps(data, indent=2, default=str)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=docflow_export.json"},
    )


@router.get("/export/csv")
async def export_csv(
    finalized_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    records = await DocumentService.get_export_data(db, finalized_only)

    output = io.StringIO()
    if records:
        writer = csv.DictWriter(output, fieldnames=records[0].model_fields.keys())
        writer.writeheader()
        for r in records:
            row = r.model_dump()
            row["keywords"] = ", ".join(row["keywords"]) if row["keywords"] else ""
            writer.writerow(row)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=docflow_export.csv"},
    )


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "service": "docflow-api"}
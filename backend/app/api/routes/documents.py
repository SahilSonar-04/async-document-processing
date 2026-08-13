import asyncio
import csv
import io
import json
import logging
import uuid as uuid_lib
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, File, Form, UploadFile, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.redis_client import get_async_redis, get_pubsub_channel, get_cached_job_status
from app.models.models import JobStatus, Job
from app.schemas.schemas import (
    UploadResponse, JobListResponse, JobResponse,
    ResultUpdateRequest, ResultResponse,
    DocumentAnswerResponse, FinalizeRequest, ExportRecord, QuestionRequest,
)
from app.services.document_service import DocumentService
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import decode_access_token
from app.models.models import JobStatus, Job, User, Document


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/jobs/{job_id}/progress")
async def stream_progress(job_id: str, token: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    import uuid
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    subject = decode_access_token(token) if token else None
    if not subject:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    try:
        user_uuid = uuid.UUID(subject)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    owner_check = await db.execute(
        select(Job.id).join(Job.document).where(Job.id == job_uuid, Document.user_id == user_uuid)
    )
    if not owner_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    terminal_events = {"job_completed", "job_failed", "job_cancelled"}
    timeout = settings.sse_timeout

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    async def poll_generator() -> AsyncGenerator[str, None]:
        poll_interval = settings.sse_poll_interval
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

            if redis:
                try:
                    event_payload = await get_cached_job_status(redis, job_id)
                except Exception:
                    pass

            if not event_payload:
                try:
                    result = await db.execute(
                        select(Job).where(Job.id == uuid_lib.UUID(job_id))
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
                if ping_counter % max(1, int(15 / poll_interval)) == 0:
                    yield ": ping\n\n"

        if redis:
            try:
                await redis.aclose()
            except Exception:
                pass

    async def combined_generator() -> AsyncGenerator[str, None]:
        if settings.sse_mode != "pubsub":
            async for chunk in poll_generator():
                yield chunk
            return

        redis = None
        pubsub = None
        try:
            redis = await get_async_redis()
            pubsub = redis.pubsub()
            channel = get_pubsub_channel(job_id)
            await pubsub.subscribe(channel)
        except Exception as e:
            logger.warning("Pub/Sub subscribe failed (%s) — falling back to poll", e)
            if pubsub:
                try:
                    await pubsub.close()
                except Exception:
                    pass
            if redis:
                try:
                    await redis.aclose()
                except Exception:
                    pass
            async for chunk in poll_generator():
                yield chunk
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
                await pubsub.unsubscribe(get_pubsub_channel(job_id))
                await pubsub.close()
                await redis.aclose()
            except Exception:
                pass

    return StreamingResponse(
        combined_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    return await DocumentService.retry_job(jid, current_user.id, db)


@router.patch("/jobs/{job_id}/result", response_model=ResultResponse)
async def update_result(job_id: str, update: ResultUpdateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    return await DocumentService.update_result(jid, current_user.id, update, db)


@router.post("/jobs/{job_id}/finalize", response_model=ResultResponse)
async def finalize_result(job_id: str, _: FinalizeRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    return await DocumentService.finalize_result(jid, current_user.id, db)


@router.post("/jobs/{job_id}/ask", response_model=DocumentAnswerResponse)
async def ask_document(job_id: str, request: QuestionRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    return await DocumentService.ask_document(jid, current_user.id, request.question, db)


@router.get("/export/json")
async def export_json(finalized_only: bool = Query(False), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = await DocumentService.get_export_data(db, current_user.id, finalized_only)
    # ... rest unchanged


@router.get("/export/csv")
async def export_csv(finalized_only: bool = Query(False), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = await DocumentService.get_export_data(db, current_user.id, finalized_only)
    output = io.StringIO()
    fieldnames = list(ExportRecord.model_fields.keys()) if not records else list(records[0].model_fields.keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames)
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


@router.get("/health")
async def health():
    return {"status": "ok", "service": "docflow-api"}


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    extraction_mode: str = Form("classical"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document, job = await DocumentService.upload_document(file, db, current_user.id, extraction_mode)
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
    extraction_mode: str = Form("classical"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if extraction_mode not in {"classical", "llm"}:
        raise HTTPException(status_code=422, detail="extraction_mode must be either 'classical' or 'llm'")
    if len(files) > DocumentService.MAX_BULK_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files in one request (max {DocumentService.MAX_BULK_FILES})")

    results = []
    errors = []
    for file in files:
        try:
            document, job = await DocumentService.upload_document(file, db, current_user.id, extraction_mode)
            results.append(UploadResponse(
                document_id=document.id, job_id=job.id, filename=document.original_filename,
                status=job.status, message="Queued",
            ))
        except HTTPException as e:
            errors.append({"filename": file.filename, "error": e.detail})

    return {"uploaded": results, "errors": errors}


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: JobStatus | None = Query(None),
    search: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await DocumentService.list_jobs(db, current_user.id, page, page_size, status, search, sort_by, sort_dir)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid
    try:
        jid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")
    return await DocumentService.get_job_detail(jid, current_user.id, db)

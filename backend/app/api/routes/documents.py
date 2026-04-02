import asyncio
import csv
import io
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, File, UploadFile, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis_client import get_async_redis, get_pubsub_channel
from app.models.models import JobStatus
from app.schemas.schemas import (
    UploadResponse, JobListResponse, JobResponse,
    ResultUpdateRequest, ResultResponse,
    FinalizeRequest,
)
from app.services.document_service import DocumentService

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
async def stream_progress(job_id: str):
    """
    Server-Sent Events endpoint.
    Subscribes to Redis Pub/Sub channel for this job and streams events
    to the client until job completes, fails, or client disconnects.
    """
    import uuid
    try:
        uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID")

    async def event_generator() -> AsyncGenerator[str, None]:
        redis = await get_async_redis()
        pubsub = redis.pubsub()
        channel = get_pubsub_channel(job_id)
        await pubsub.subscribe(channel)

        terminal_events = {"job_completed", "job_failed", "job_cancelled"}
        timeout = 300  # 5 minutes max

        try:
            elapsed = 0
            while elapsed < timeout:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    data = message["data"]
                    yield f"data: {data}\n\n"

                    # Close stream on terminal event
                    try:
                        parsed = json.loads(data)
                        if parsed.get("event") in terminal_events:
                            break
                    except json.JSONDecodeError:
                        pass
                else:
                    # Send keepalive ping every 15s
                    elapsed += 1
                    if elapsed % 15 == 0:
                        yield f": ping\n\n"

                await asyncio.sleep(0)  # Yield to event loop
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await redis.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
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

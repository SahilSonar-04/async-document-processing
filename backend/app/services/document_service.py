import os
import uuid
import math
import aiofiles
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.models import Document, Job, ProcessingResult, JobStatus
from app.schemas.schemas import (
    JobListResponse, JobListItem, ResultUpdateRequest, ExportRecord,
)
from app.workers.tasks import process_document_task


class DocumentService:

    @staticmethod
    async def upload_document(file: UploadFile, db: AsyncSession) -> tuple[Document, Job]:
        """Validate, store file on disk, create DB records, enqueue Celery task."""

        # ── Validate ──────────────────────────────────────────────────
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in settings.allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"File type .{ext} not allowed. Accepted: {settings.allowed_extensions}",
            )

        content = await file.read()
        if len(content) > settings.max_file_size_mb * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large")

        # ── Store on disk ─────────────────────────────────────────────
        unique_name = f"{uuid.uuid4().hex}_{file.filename}"
        storage_path = os.path.join(settings.upload_dir, unique_name)
        os.makedirs(settings.upload_dir, exist_ok=True)

        async with aiofiles.open(storage_path, "wb") as f:
            await f.write(content)

        document = Document(
            filename=unique_name,
            original_filename=file.filename,
            file_type=ext,
            file_size=len(content),
            storage_path=storage_path,
            file_content=content,
        )
        db.add(document)
        await db.flush()

        job = Job(document_id=document.id, status=JobStatus.QUEUED, progress=0)
        db.add(job)
        # Commit so the job exists in DB before the worker picks it up
        await db.commit()

        # ── Enqueue Celery task ───────────────────────────────────────
        task = process_document_task.delay(
            str(job.id),
            str(document.id),
            storage_path,
            file.filename,
            ext,
        )
        job.celery_task_id = task.id
        await db.commit()

        return document, job

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        page: int,
        page_size: int,
        status: JobStatus | None,
        search: str | None,
        sort_by: str,
        sort_dir: str,
    ) -> JobListResponse:
        """List jobs with filtering, searching, sorting, and pagination."""

        query = select(Job).options(selectinload(Job.document))

        # Filters
        if status:
            query = query.where(Job.status == status)
        if search:
            query = query.join(Job.document).where(
                or_(
                    Document.original_filename.ilike(f"%{search}%"),
                    Document.file_type.ilike(f"%{search}%"),
                )
            )

        # Count
        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        # Sort
        sort_col = getattr(Job, sort_by, Job.created_at)
        order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
        query = query.order_by(order)

        # Paginate
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        jobs = result.scalars().all()

        return JobListResponse(
            items=[JobListItem.model_validate(j) for j in jobs],
            total=total,
            page=page,
            page_size=page_size,
            pages=max(1, math.ceil(total / page_size)),
        )

    @staticmethod
    async def get_job_detail(job_id: uuid.UUID, db: AsyncSession) -> Job:
        """Get full job detail with document and result."""
        query = (
            select(Job)
            .options(selectinload(Job.document), selectinload(Job.result))
            .where(Job.id == job_id)
        )
        result = await db.execute(query)
        job = result.scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @staticmethod
    async def retry_job(job_id: uuid.UUID, db: AsyncSession) -> Job:
        """Retry a failed job by resetting state and re-enqueuing."""
        job = await DocumentService.get_job_detail(job_id, db)

        if job.status not in (JobStatus.FAILED, JobStatus.CANCELLED):
            raise HTTPException(
                status_code=400,
                detail=f"Can only retry failed/cancelled jobs. Current: {job.status}",
            )

        job.status = JobStatus.QUEUED
        job.progress = 0
        job.current_stage = None
        job.error_message = None
        job.retry_count += 1
        job.completed_at = None

        await db.commit()

        task = process_document_task.delay(
            str(job.id),
            str(job.document_id),
            job.document.storage_path,
            job.document.original_filename,
            job.document.file_type,
        )
        job.celery_task_id = task.id
        await db.commit()

        return job

    @staticmethod
    async def update_result(
        job_id: uuid.UUID, update: ResultUpdateRequest, db: AsyncSession
    ) -> ProcessingResult:
        """Edit fields on a processing result (before finalization)."""
        query = select(ProcessingResult).where(ProcessingResult.job_id == job_id)
        result = (await db.execute(query)).scalar_one_or_none()

        if not result:
            raise HTTPException(status_code=404, detail="Result not found for this job")
        if result.is_finalized:
            raise HTTPException(status_code=400, detail="Cannot edit a finalized result")

        for field, value in update.model_dump(exclude_unset=True).items():
            setattr(result, field, value)
        result.edited_at = datetime.now(timezone.utc)
        await db.flush()

        return result

    @staticmethod
    async def finalize_result(job_id: uuid.UUID, db: AsyncSession) -> ProcessingResult:
        """Mark a result as finalized (locks further edits)."""
        query = select(ProcessingResult).where(ProcessingResult.job_id == job_id)
        result = (await db.execute(query)).scalar_one_or_none()

        if not result:
            raise HTTPException(status_code=404, detail="Result not found for this job")
        if result.is_finalized:
            raise HTTPException(status_code=400, detail="Already finalized")

        result.is_finalized = True
        result.finalized_at = datetime.now(timezone.utc)
        await db.flush()

        return result

    @staticmethod
    async def get_export_data(
        db: AsyncSession, finalized_only: bool = False
    ) -> list[ExportRecord]:
        """Build export records from completed jobs."""
        query = (
            select(Job)
            .options(selectinload(Job.document), selectinload(Job.result))
            .where(Job.status == JobStatus.COMPLETED)
        )

        if finalized_only:
            query = query.join(Job.result).where(ProcessingResult.is_finalized == True)

        rows = (await db.execute(query)).scalars().all()
        records = []
        for job in rows:
            if not job.result:
                continue
            records.append(
                ExportRecord(
                    job_id=str(job.id),
                    document_filename=job.document.original_filename,
                    file_type=job.document.file_type,
                    file_size=job.document.file_size,
                    title=job.result.title,
                    category=job.result.category,
                    summary=job.result.summary,
                    keywords=job.result.keywords,
                    word_count=job.result.word_count,
                    language=job.result.language,
                    is_finalized=job.result.is_finalized,
                    finalized_at=str(job.result.finalized_at) if job.result.finalized_at else None,
                    uploaded_at=str(job.document.uploaded_at),
                    completed_at=str(job.completed_at) if job.completed_at else None,
                )
            )
        return records
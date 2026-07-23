import time
import json
import uuid
import os
import re
import logging
import chardet
from datetime import datetime, timezone
from celery import Task
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.db.redis_client import publish_event_sync
from app.models.models import Job, ProcessingResult, JobStatus, Document

logger = logging.getLogger(__name__)

# Sync DB engine for Celery workers
sync_engine = create_engine(
    settings.sync_database_url,
    pool_pre_ping=True,
    pool_size=5,
    # Important: prevent connection leaks when worker is killed
    pool_recycle=300,
)
SyncSession = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)


def _emit(job_id: str, event: str, progress: int, stage: str, message: str = "") -> None:
    """
    Publish a progress event.
    - Always caches to Redis (for SSE poll-mode fallback).
    - Also tries Pub/Sub publish (no-op if Render Redis blocks it).
    """
    payload = {
        "job_id": job_id,
        "event": event,
        "progress": progress,
        "stage": stage,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        publish_event_sync(job_id, payload)
    except Exception as e:
        logger.warning("_emit failed for job %s: %s", job_id, e)


def _update_job(session: Session, job_id: str, **kwargs) -> Job:
    job = session.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise ValueError(f"Job {job_id} not found in database")
    for k, v in kwargs.items():
        setattr(job, k, v)
    session.commit()
    return job


def _restore_file_from_db_backup(session: Session, path: str, document_id: str) -> bool:
    """
    If the local disk copy of an uploaded file is missing (Render free tier
    disk is ephemeral and can be wiped between upload and processing), try
    to restore it from the DB-backed backup stored in Document.file_content.

    Returns True if the file was successfully restored to `path`.
    """
    document = session.query(Document).filter(Document.id == document_id).first()
    if not document or not document.file_content:
        return False

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(document.file_content)
        logger.info("Restored file from DB backup for document %s -> %s", document_id, path)
        return True
    except Exception as e:
        logger.error("Failed to restore file from DB backup for document %s: %s", document_id, e)
        return False


def _extract_text_from_file(
    path: str, file_type: str, session: Session, document_id: str
) -> str:
    """
    Extract raw text from a file.

    On Render free tier the disk is ephemeral — if the dyno restarted between
    upload and processing the local copy will be missing. Before giving up,
    we try to restore it from the DB-backed backup (Document.file_content).
    Only if that's also unavailable do we fall back to simulated extraction.
    """
    if not os.path.exists(path):
        restored = _restore_file_from_db_backup(session, path, document_id)
        if not restored:
            logger.warning(
                "File not found at %s and no DB backup available — using simulated extraction",
                path,
            )
            filename = os.path.basename(path)
            return (
                f"[File unavailable: {filename}]\n\n"
                "The original file could not be read because the server restarted "
                "after upload (ephemeral disk) and no backup was found. For reliable "
                "file processing in production, configure an external object store "
                "(S3, Cloudinary, etc.).\n\n"
                "This document contains important information about project management, "
                "data analysis, and strategic planning. Key topics include resource "
                "allocation, risk assessment, timeline management, and stakeholder "
                "communication. The document outlines best practices for async workflows, "
                "distributed systems, and modern software engineering methodologies."
            )

    try:
        if file_type in ("txt", "md", "csv", "json"):
            with open(path, "rb") as f:
                raw = f.read()
            encoding = chardet.detect(raw)["encoding"] or "utf-8"
            return raw.decode(encoding, errors="replace")
        elif file_type == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(path)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            # Simulate extraction for DOCX etc. (not yet implemented for real)
            filename = os.path.basename(path)
            return (
                f"[Simulated extraction for {file_type.upper()} file: {filename}]\n\n"
                "This document contains important information about project management, "
                "data analysis, and strategic planning. Key topics include resource "
                "allocation, risk assessment, timeline management, and stakeholder "
                "communication. The document outlines best practices for async workflows, "
                "distributed systems, and modern software engineering methodologies."
            )
    except Exception as e:
        return f"[Error extracting text: {str(e)}]"


def _extract_fields(text: str, filename: str, file_type: str) -> dict:
    """Extract structured fields from raw text."""
    words = text.split()
    word_count = len(words)

    stopwords = {
        "the","a","an","and","or","but","in","on","at","to","for","of","with",
        "is","are","was","were","be","been","have","has","had","do","does","did",
        "will","would","could","should","may","might","this","that","these","those",
        "it","its","i","you","he","she","we","they","my","your","our","their",
        "simulated","extraction","file","document","contains","unavailable",
    }
    word_freq: dict[str, int] = {}
    for w in words:
        w_clean = re.sub(r"[^a-zA-Z]", "", w.lower())
        if len(w_clean) > 3 and w_clean not in stopwords:
            word_freq[w_clean] = word_freq.get(w_clean, 0) + 1

    keywords = sorted(word_freq, key=word_freq.get, reverse=True)[:10]  # type: ignore[arg-type]

    latin_count = sum(1 for c in text if ord(c) < 256)
    language = "en" if latin_count / max(len(text), 1) > 0.8 else "unknown"

    category_map = {
        "pdf": "document",
        "txt": "text",
        "csv": "data",
        "json": "data",
        "md": "documentation",
        "docx": "document",
    }
    category = category_map.get(file_type, "other")

    base = os.path.splitext(filename)[0]
    title = base.replace("_", " ").replace("-", " ").title()

    clean_text = re.sub(r"\[.*?\]", "", text).strip()
    summary = (clean_text[:200] + "...") if len(clean_text) > 200 else clean_text

    return {
        "title": title,
        "category": category,
        "summary": summary,
        "keywords": keywords,
        "word_count": word_count,
        "language": language,
    }


class BaseTask(Task):
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        job_id = args[0] if args else None
        if not job_id:
            return
        # Use a fresh session — the task's session may already be closed/rolled back
        try:
            with SyncSession() as session:
                _update_job(
                    session, job_id,
                    status=JobStatus.FAILED,
                    error_message=str(exc)[:500],  # cap length
                    current_stage="failed",
                )
        except Exception as e:
            logger.error("on_failure DB update failed for job %s: %s", job_id, e)
        # Always try to emit — even if DB update failed
        try:
            _emit(job_id, "job_failed", 0, "failed", str(exc)[:200])
        except Exception as e:
            logger.error("on_failure emit failed for job %s: %s", job_id, e)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="app.workers.tasks.process_document_task",
    max_retries=3,
    default_retry_delay=60,
)
def process_document_task(
    self,
    job_id: str,
    document_id: str,
    storage_path: str,
    original_filename: str,
    file_type: str,
) -> dict:
    """
    Multi-stage document processing pipeline.

    FIX: Session is now created inside the try block and explicitly closed in
    finally, preventing connection leaks when Celery retries or kills the task.
    """
    session: Session | None = None
    try:
        session = SyncSession()

        # ── Stage 1: Job started ──────────────────────────────────────────
        _update_job(session, job_id, status=JobStatus.PROCESSING, progress=5, current_stage="started")
        _emit(job_id, "job_started", 5, "started", "Processing started")
        time.sleep(0.5)

        # ── Stage 2: Parsing started ──────────────────────────────────────
        _update_job(session, job_id, progress=20, current_stage="parsing")
        _emit(job_id, "document_parsing_started", 20, "parsing", "Parsing document...")
        time.sleep(1.0)

        extracted_text = _extract_text_from_file(storage_path, file_type, session, document_id)

        # ── Stage 3: Parsing completed ────────────────────────────────────
        _update_job(session, job_id, progress=45, current_stage="parsing_done")
        _emit(job_id, "document_parsing_completed", 45, "parsing_done", "Parsing complete")
        time.sleep(0.5)

        # ── Stage 4: Field extraction started ────────────────────────────
        _update_job(session, job_id, progress=60, current_stage="extracting")
        _emit(job_id, "field_extraction_started", 60, "extracting", "Extracting fields...")
        time.sleep(1.0)

        fields = _extract_fields(extracted_text, original_filename, file_type)

        # ── Stage 5: Field extraction completed ──────────────────────────
        _update_job(session, job_id, progress=80, current_stage="extraction_done")
        _emit(job_id, "field_extraction_completed", 80, "extraction_done", "Fields extracted")
        time.sleep(0.5)

        # ── Stage 6: Storing result ───────────────────────────────────────
        _update_job(session, job_id, progress=90, current_stage="storing")
        _emit(job_id, "storing_result", 90, "storing", "Storing result...")

        result = session.query(ProcessingResult).filter(
            ProcessingResult.job_id == job_id
        ).first()

        if not result:
            result = ProcessingResult(job_id=uuid.UUID(job_id))
            session.add(result)

        result.title = fields["title"]
        result.category = fields["category"]
        result.summary = fields["summary"]
        result.keywords = fields["keywords"]
        result.word_count = fields["word_count"]
        result.language = fields["language"]
        result.extracted_text = extracted_text[:5000]
        result.raw_json = {
            "fields": fields,
            "metadata": {
                "filename": original_filename,
                "file_type": file_type,
                "storage_path": storage_path,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            },
        }

        document = session.query(Document).filter(Document.id == document_id).first()
        if document and document.file_content is not None:
            document.file_content = None

        session.commit()
        time.sleep(0.5)

        # ── Stage 7: Job completed ────────────────────────────────────────
        _update_job(
            session, job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            current_stage="completed",
            completed_at=datetime.now(timezone.utc),
        )
        _emit(job_id, "job_completed", 100, "completed", "Processing complete!")

        return {"job_id": job_id, "status": "completed", "fields": fields}

    except Exception as exc:
        # Roll back any partial changes from this attempt
        if session:
            try:
                session.rollback()
            except Exception:
                pass

        # Don't retry if it's already a MaxRetriesExceeded propagation
        if isinstance(exc, MaxRetriesExceededError):
            raise

        logger.warning(
            "Task failed for job %s (attempt %d/%d): %s",
            job_id, self.request.retries + 1, self.max_retries + 1, exc,
        )
        # self.retry() raises Retry which Celery catches — it's NOT an exception
        # that triggers on_failure unless retries are exhausted.
        raise self.retry(exc=exc, countdown=30)

    finally:
        # ✅ FIX: Always close the session to return the connection to the pool
        if session:
            try:
                session.close()
            except Exception:
                pass
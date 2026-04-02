import time
import json
import uuid
import os
import re
import chardet
from datetime import datetime, timezone
from celery import Task
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.db.redis_client import publish_event_sync, get_pubsub_channel
from app.models.models import Job, Document, ProcessingResult, JobStatus

# Sync DB engine for Celery workers
sync_engine = create_engine(
    settings.sync_database_url,
    pool_pre_ping=True,
    pool_size=5,
)
SyncSession = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)


def _emit(job_id: str, event: str, progress: int, stage: str, message: str = "") -> None:
    """Publish a progress event to Redis Pub/Sub and cache latest status."""
    payload = {
        "job_id": job_id,
        "event": event,
        "progress": progress,
        "stage": stage,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    publish_event_sync(job_id, payload)


def _update_job(session: Session, job_id: str, **kwargs) -> Job:
    job = session.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise ValueError(f"Job {job_id} not found in database")
    for k, v in kwargs.items():
        setattr(job, k, v)
    session.commit()
    return job


def _extract_text_from_file(path: str, file_type: str) -> str:
    """Extract raw text from a file. Simulated for non-text formats."""
    try:
        if file_type in ("txt", "md", "csv", "json"):
            with open(path, "rb") as f:
                raw = f.read()
            encoding = chardet.detect(raw)["encoding"] or "utf-8"
            return raw.decode(encoding, errors="replace")
        else:
            # Simulate extraction for PDF, DOCX etc.
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

    # Simple keyword extraction (top words excluding stopwords)
    stopwords = {
        "the","a","an","and","or","but","in","on","at","to","for","of","with",
        "is","are","was","were","be","been","have","has","had","do","does","did",
        "will","would","could","should","may","might","this","that","these","those",
        "it","its","i","you","he","she","we","they","my","your","our","their",
        "simulated","extraction","file","document","contains"
    }
    word_freq: dict[str, int] = {}
    for w in words:
        w_clean = re.sub(r"[^a-zA-Z]", "", w.lower())
        if len(w_clean) > 3 and w_clean not in stopwords:
            word_freq[w_clean] = word_freq.get(w_clean, 0) + 1

    keywords = sorted(word_freq, key=word_freq.get, reverse=True)[:10]

    # Detect language (simplified)
    latin_count = sum(1 for c in text if ord(c) < 256)
    language = "en" if latin_count / max(len(text), 1) > 0.8 else "unknown"

    # Derive category from file type / content
    category_map = {
        "pdf": "document",
        "txt": "text",
        "csv": "data",
        "json": "data",
        "md": "documentation",
        "docx": "document",
    }
    category = category_map.get(file_type, "other")

    # Generate title from filename
    base = os.path.splitext(filename)[0]
    title = base.replace("_", " ").replace("-", " ").title()

    # Generate summary (first 200 chars of extracted text, cleaned up)
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
        if job_id:
            with SyncSession() as session:
                _update_job(
                    session, job_id,
                    status=JobStatus.FAILED,
                    error_message=str(exc),
                    current_stage="failed",
                )
            _emit(job_id, "job_failed", 0, "failed", str(exc))


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
    Each stage emits a Pub/Sub event so the frontend shows live progress.
    """

    with SyncSession() as session:
        try:
            # ── Stage 1: Job started ──────────────────────────────────────
            _update_job(session, job_id, status=JobStatus.PROCESSING, progress=5, current_stage="started")
            _emit(job_id, "job_started", 5, "started", "Processing started")
            time.sleep(0.5)

            # ── Stage 2: Parsing started ──────────────────────────────────
            _update_job(session, job_id, progress=20, current_stage="parsing")
            _emit(job_id, "document_parsing_started", 20, "parsing", "Parsing document...")
            time.sleep(1.0)

            extracted_text = _extract_text_from_file(storage_path, file_type)

            # ── Stage 3: Parsing completed ────────────────────────────────
            _update_job(session, job_id, progress=45, current_stage="parsing_done")
            _emit(job_id, "document_parsing_completed", 45, "parsing_done", "Parsing complete")
            time.sleep(0.5)

            # ── Stage 4: Field extraction started ────────────────────────
            _update_job(session, job_id, progress=60, current_stage="extracting")
            _emit(job_id, "field_extraction_started", 60, "extracting", "Extracting fields...")
            time.sleep(1.0)

            fields = _extract_fields(extracted_text, original_filename, file_type)

            # ── Stage 5: Field extraction completed ──────────────────────
            _update_job(session, job_id, progress=80, current_stage="extraction_done")
            _emit(job_id, "field_extraction_completed", 80, "extraction_done", "Fields extracted")
            time.sleep(0.5)

            # ── Stage 6: Storing result ───────────────────────────────────
            _update_job(session, job_id, progress=90, current_stage="storing")
            _emit(job_id, "storing_result", 90, "storing", "Storing result...")

            # Upsert result
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
            result.extracted_text = extracted_text[:5000]  # Cap stored text
            result.raw_json = {
                "fields": fields,
                "metadata": {
                    "filename": original_filename,
                    "file_type": file_type,
                    "storage_path": storage_path,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                },
            }

            session.commit()
            time.sleep(0.5)

            # ── Stage 7: Job completed ────────────────────────────────────
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
            session.rollback()
            # Let Celery retry handle it via BaseTask.on_failure
            raise self.retry(exc=exc, countdown=30)

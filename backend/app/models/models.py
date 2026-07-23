import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Integer, Boolean, Text, DateTime, Enum,
    ForeignKey, JSON, LargeBinary, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class JobStatus(str, PyEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)

    # DB-backed backup of the raw file bytes. Render's free-tier disk is
    # ephemeral and can be wiped between upload and processing (e.g. on a
    # restart/redeploy). The worker falls back to this column if the local
    # disk copy is missing. Cleared out after successful processing since
    # it's only needed as a transient backup, not permanent storage.
    file_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    job: Mapped["Job"] = relationship("Job", back_populates="document", uselist=False)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus), default=JobStatus.QUEUED, nullable=False, index=True
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)  # 0-100
    current_stage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="job")
    result: Mapped["ProcessingResult"] = relationship(
        "ProcessingResult", back_populates="job", uselist=False
    )


class ProcessingResult(Base):
    __tablename__ = "processing_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )

    # Extracted structured fields
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list | None] = mapped_column(JSON, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Raw extracted text and full JSON snapshot
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Review workflow
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    finalized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    job: Mapped["Job"] = relationship("Job", back_populates="result")
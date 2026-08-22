"""SQLAlchemy database models for DocFlow.

This module defines ORM models and relationships for:
- User accounts and authentication credentials
- Ingested documents and fallback file storage
- Asynchronous processing jobs and status lifecycles
- Extracted document metadata and structured summaries
- Vector-indexed document chunks with pgvector embeddings
- Autonomous AI research agent query traces and audit logs
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Integer, Boolean, Text, DateTime, Enum,
    ForeignKey, JSON, LargeBinary, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.db.base import Base


class JobStatus(str, PyEnum):
    """Lifecycle status states for document processing jobs."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class User(Base):
    """User account entity.

    Attributes:
        id: Primary key UUID.
        email: Unique user email address used for login.
        hashed_password: Argon2 or bcrypt password hash.
        created_at: Timestamp when user registered.
        documents: Collection of documents uploaded by this user.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    documents: Mapped[list["Document"]] = relationship("Document", back_populates="user")


class Document(Base):
    """Uploaded document record and metadata.

    Attributes:
        id: Primary key UUID.
        filename: Unique sanitized internal storage filename.
        original_filename: User-provided original filename.
        file_type: Lowercase file extension (e.g. "pdf", "csv").
        file_size: Size of uploaded file in bytes.
        storage_path: Absolute filesystem path to stored file.
        file_content: Optional raw binary backup for ephemeral disk environments.
        uploaded_at: Ingestion timestamp.
        user_id: Foreign key referencing the owning user.
        user: Relationship to the owning User model.
        job: One-to-one relationship to the associated processing Job.
        chunks: Vector-embedded chunk passages created during processing.
    """
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)

    file_content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user: Mapped["User | None"] = relationship("User", back_populates="documents")

    job: Mapped["Job"] = relationship("Job", back_populates="document", uselist=False)
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )


class Job(Base):
    """Asynchronous background processing job lifecycle tracking.

    Attributes:
        id: Primary key UUID.
        document_id: Foreign key referencing the target Document.
        celery_task_id: Active Celery task UUID string.
        status: Current processing state enum (QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED).
        progress: Completion percentage (0 to 100).
        current_stage: Descriptive processing stage identifier.
        error_message: Error details if processing failed.
        retry_count: Number of times this job has been retried.
        extraction_mode: Metadata extraction strategy ("classical" or "llm").
        created_at: Initial job creation timestamp.
        updated_at: Last progress or status modification timestamp.
        completed_at: Final completion or termination timestamp.
        document: Relationship back to the target Document.
        result: One-to-one relationship to extracted ProcessingResult.
    """
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
    progress: Mapped[int] = mapped_column(Integer, default=0)
    current_stage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    extraction_mode: Mapped[str] = mapped_column(
        String(20), default="classical", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    document: Mapped["Document"] = relationship("Document", back_populates="job")
    result: Mapped["ProcessingResult"] = relationship(
        "ProcessingResult", back_populates="job", uselist=False
    )


class ProcessingResult(Base):
    """Structured extraction results and metadata derived from document processing.

    Attributes:
        id: Primary key UUID.
        job_id: Foreign key referencing the parent Job.
        title: Extracted or inferred document title.
        category: Classified category (document, text, data, documentation, other).
        summary: Concise natural language summary.
        keywords: JSON array of extracted key phrases.
        word_count: Total word count in extracted text.
        language: Detected ISO language code (e.g., "en", "es").
        extracted_text: Cleaned extracted text snippet.
        raw_json: Full JSON payload containing processing metadata and diagnostics.
        is_finalized: Whether result has been locked against further edits.
        finalized_at: Timestamp when result was locked.
        edited_at: Timestamp of latest user edit.
        created_at: Timestamp when record was created.
        job: Relationship back to the parent Job.
    """
    __tablename__ = "processing_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list | None] = mapped_column(JSON, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)

    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

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

    job: Mapped["Job"] = relationship("Job", back_populates="result")


class DocumentChunk(Base):
    """Document passage chunk and 768-dimensional vector embedding for semantic search.

    Attributes:
        id: Primary key UUID.
        document_id: Foreign key referencing the parent Document.
        chunk_index: Sequential zero-based index of the passage within the document.
        content: Text content of the chunk passage.
        embedding: 768-dimensional pgvector float embedding.
        created_at: Embedding generation timestamp.
        document: Relationship back to the parent Document.
    """
    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(768), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")


class AgentQuery(Base):
    """Audit log and trace history of autonomous AI research agent executions.

    Attributes:
        id: Primary key UUID.
        user_id: Foreign key referencing the user who initiated the query.
        question: User's original natural language research question.
        answer: Final synthesized plain-text answer produced by the agent.
        tool_trace: Complete chronological JSON trace of tools executed, inputs, and results.
        steps_taken: Number of ReAct tool calling iterations executed.
        latency_ms: Total execution duration in milliseconds.
        llm_call_count: Total LLM inference invocations during the reasoning loop.
        created_at: Execution timestamp.
    """
    __tablename__ = "agent_queries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    tool_trace: Mapped[list] = mapped_column(JSON, nullable=False)
    steps_taken: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    llm_call_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

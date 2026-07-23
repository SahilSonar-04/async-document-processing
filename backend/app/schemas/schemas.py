from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict
from app.models.models import JobStatus


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    celery_task_id: str | None
    status: JobStatus
    progress: int
    current_stage: str | None
    error_message: str | None
    retry_count: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    document: DocumentSummary | None = None
    result: ResultResponse | None = None


class JobListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    status: JobStatus
    progress: int
    current_stage: str | None
    retry_count: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    document: DocumentSummary | None = None


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    file_type: str
    file_size: int
    uploaded_at: datetime


class ResultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    title: str | None
    category: str | None
    summary: str | None
    keywords: list[str] | None
    word_count: int | None
    language: str | None
    extracted_text: str | None
    raw_json: dict[str, Any] | None
    is_finalized: bool
    finalized_at: datetime | None
    edited_at: datetime | None
    created_at: datetime


class ResultUpdateRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    summary: str | None = None
    keywords: list[str] | None = None


class FinalizeRequest(BaseModel):
    confirmed: bool = True


class JobListResponse(BaseModel):
    items: list[JobListItem]
    total: int
    page: int
    page_size: int
    pages: int


class UploadResponse(BaseModel):
    document_id: uuid.UUID
    job_id: uuid.UUID
    filename: str
    status: JobStatus
    message: str


class ExportRecord(BaseModel):
    job_id: str
    document_filename: str
    file_type: str
    file_size: int
    title: str | None
    category: str | None
    summary: str | None
    keywords: list[str] | None
    word_count: int | None
    language: str | None
    is_finalized: bool
    finalized_at: str | None
    uploaded_at: str
    completed_at: str | None
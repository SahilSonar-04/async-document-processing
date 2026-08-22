"""Pydantic schemas and serialization models for DocFlow API.

This module defines request payloads, response envelopes, pagination wrappers,
and export record schemas for authentication, document processing, and AI agents.
"""

from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from app.models.models import JobStatus


class UserCreate(BaseModel):
    """Payload for new user registration."""
    email: EmailStr = Field(description="User's valid email address")
    password: str = Field(min_length=8, max_length=128, description="Plaintext password (8-128 chars)")


class UserLogin(BaseModel):
    """Payload for user authentication."""
    email: EmailStr = Field(description="User's registered email address")
    password: str = Field(description="User's plaintext password")


class UserResponse(BaseModel):
    """Public user profile response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="User unique identifier")
    email: str = Field(description="User's email address")
    created_at: datetime = Field(description="Account creation timestamp")


class TokenResponse(BaseModel):
    """JWT access token response."""
    access_token: str = Field(description="Signed JWT access token")
    token_type: str = Field(default="bearer", description="Token authentication scheme")


class DocumentSummary(BaseModel):
    """Compact summary of document attributes embedded in job responses."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="Document unique identifier")
    original_filename: str = Field(description="Original user-provided filename")
    file_type: str = Field(description="Document file extension")
    file_size: int = Field(description="File size in bytes")
    uploaded_at: datetime = Field(description="Ingestion timestamp")


class ResultResponse(BaseModel):
    """Extracted metadata and structured content response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="Result record unique identifier")
    job_id: uuid.UUID = Field(description="Associated job unique identifier")
    title: str | None = Field(default=None, description="Document title")
    category: str | None = Field(default=None, description="Classified category")
    summary: str | None = Field(default=None, description="Natural language summary")
    keywords: list[str] | None = Field(default=None, description="Extracted keywords")
    word_count: int | None = Field(default=None, description="Total word count")
    language: str | None = Field(default=None, description="Detected language code")
    extracted_text: str | None = Field(default=None, description="Snippet of extracted text")
    raw_json: dict[str, Any] | None = Field(default=None, description="Full diagnostic JSON payload")
    is_finalized: bool = Field(description="Whether result is locked against edits")
    finalized_at: datetime | None = Field(default=None, description="Timestamp when finalized")
    edited_at: datetime | None = Field(default=None, description="Timestamp of latest edit")
    created_at: datetime = Field(description="Creation timestamp")


class JobResponse(BaseModel):
    """Comprehensive job detail response including document and result relations."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="Job unique identifier")
    document_id: uuid.UUID = Field(description="Target document unique identifier")
    celery_task_id: str | None = Field(default=None, description="Underlying Celery task ID")
    status: JobStatus = Field(description="Current job lifecycle state")
    progress: int = Field(description="Processing completion percentage (0-100)")
    current_stage: str | None = Field(default=None, description="Current workflow stage identifier")
    error_message: str | None = Field(default=None, description="Error message if processing failed")
    retry_count: int = Field(description="Number of retry attempts executed")
    extraction_mode: str = Field(description="Extraction mode used (classical or llm)")
    created_at: datetime = Field(description="Job creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    completed_at: datetime | None = Field(default=None, description="Completion timestamp")
    document: DocumentSummary | None = Field(default=None, description="Target document summary")
    result: ResultResponse | None = Field(default=None, description="Extracted result if completed")


class JobListItem(BaseModel):
    """Compact job item for paginated listings."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="Job unique identifier")
    document_id: uuid.UUID = Field(description="Target document unique identifier")
    status: JobStatus = Field(description="Current job status")
    progress: int = Field(description="Processing progress (0-100)")
    current_stage: str | None = Field(default=None, description="Current workflow stage")
    retry_count: int = Field(description="Number of retries executed")
    created_at: datetime = Field(description="Job creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    completed_at: datetime | None = Field(default=None, description="Completion timestamp")
    document: DocumentSummary | None = Field(default=None, description="Target document summary")


class ResultUpdateRequest(BaseModel):
    """Editable fields for modifying extracted document results."""
    title: str | None = Field(default=None, description="Updated document title")
    category: str | None = Field(default=None, description="Updated category classification")
    summary: str | None = Field(default=None, description="Updated summary")
    keywords: list[str] | None = Field(default=None, description="Updated keyword list")


class FinalizeRequest(BaseModel):
    """Confirmation payload to lock a result against further modifications."""
    confirmed: bool = Field(default=True, description="Explicit confirmation flag")


class QuestionRequest(BaseModel):
    """Natural language question request for Q&A or agent research."""
    question: str = Field(min_length=3, max_length=1000, description="Natural language question")


class ChunkCitation(BaseModel):
    """Source passage citation retrieved via pgvector cosine similarity."""
    chunk_index: int = Field(description="Zero-based chunk passage index")
    snippet: str = Field(description="Text snippet from the matched chunk")
    similarity: float = Field(description="Cosine similarity score (0.0 to 1.0)")


class DocumentAnswerResponse(BaseModel):
    """Direct single-document RAG answer response with source citations."""
    answer: str = Field(description="Synthesized natural language answer")
    citations: list[ChunkCitation] = Field(description="Supporting document citations")
    latency_ms: int = Field(description="Total latency in milliseconds")
    llm_call_count: int = Field(description="Number of LLM API calls made")


class AgentStepResponse(BaseModel):
    """Record of an individual tool call executed by the autonomous agent."""
    tool: str = Field(description="Name of the invoked tool")
    args: dict[str, Any] = Field(description="Input arguments passed to the tool")
    result: Any | None = Field(default=None, description="Output returned by the tool")
    error: str | None = Field(default=None, description="Error message if tool invocation failed")


class AgentAnswerResponse(BaseModel):
    """Final answer and reasoning trace produced by the autonomous research agent."""
    answer: str = Field(description="Final synthesized answer")
    steps_taken: int = Field(description="Number of reasoning/tool iterations taken")
    tool_trace: list[AgentStepResponse] = Field(description="Chronological tool execution trace")
    latency_ms: int = Field(description="Total execution latency in milliseconds")
    llm_call_count: int = Field(description="Total LLM calls executed during the ReAct loop")


class AgentQueryHistoryItem(BaseModel):
    """Historical agent query record."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(description="Query log unique identifier")
    question: str = Field(description="Original user question")
    answer: str = Field(description="Final answer provided by the agent")
    steps_taken: int = Field(description="Number of tool steps executed")
    tool_trace: list[AgentStepResponse] = Field(description="Complete tool invocation trace")
    created_at: datetime = Field(description="Query timestamp")
    latency_ms: int = Field(description="Execution latency in milliseconds")
    llm_call_count: int = Field(description="Total LLM invocations")


class AgentHistoryResponse(BaseModel):
    """Paginated or listed agent query audit history."""
    items: list[AgentQueryHistoryItem] = Field(description="List of historical agent queries")


class JobListResponse(BaseModel):
    """Paginated list envelope for document jobs."""
    items: list[JobListItem] = Field(description="List of jobs for the requested page")
    total: int = Field(description="Total matching job records")
    page: int = Field(description="Current page index (1-based)")
    page_size: int = Field(description="Number of items per page")
    pages: int = Field(description="Total number of available pages")


class UploadResponse(BaseModel):
    """Response returned upon successful document upload and job scheduling."""
    document_id: uuid.UUID = Field(description="Created document UUID")
    job_id: uuid.UUID = Field(description="Created processing job UUID")
    filename: str = Field(description="Sanitized storage filename")
    status: JobStatus = Field(description="Initial job status (typically queued)")
    message: str = Field(description="Status confirmation message")


class ExportRecord(BaseModel):
    """Normalized document record schema for CSV and JSON batch exports."""
    job_id: str = Field(description="Job UUID string")
    document_filename: str = Field(description="Original document filename")
    file_type: str = Field(description="File extension")
    file_size: int = Field(description="File size in bytes")
    title: str | None = Field(default=None, description="Document title")
    category: str | None = Field(default=None, description="Document category")
    summary: str | None = Field(default=None, description="Document summary")
    keywords: list[str] | None = Field(default=None, description="List of keywords")
    word_count: int | None = Field(default=None, description="Word count")
    language: str | None = Field(default=None, description="Detected language code")
    is_finalized: bool = Field(description="Whether document result is finalized")
    finalized_at: str | None = Field(default=None, description="ISO timestamp when finalized")
    uploaded_at: str = Field(description="ISO timestamp when uploaded")
    completed_at: str | None = Field(default=None, description="ISO timestamp when processing completed")

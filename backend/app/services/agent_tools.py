import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Document, Job, ProcessingResult
from app.services.llm_client import (
    LLMServiceError,
    answer_document_question,
    embed_question,
)

DEFAULT_TOP_K = 5


class AgentToolError(RuntimeError):
    pass


async def search_document_chunks(
    db: AsyncSession,
    document_id: uuid.UUID,
    user_id: uuid.UUID,
    query: str,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict[str, Any]]:
    owner_check = await db.execute(
        select(Document.id).where(Document.id == document_id, Document.user_id == user_id)
    )
    if not owner_check.scalar_one_or_none():
        raise AgentToolError("Document not found")

    try:
        query_vector = await embed_question(query)
    except LLMServiceError as exc:
        raise AgentToolError(f"Embedding unavailable: {exc}") from exc

    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
    rows = (
        await db.execute(
            text(
                """
                SELECT chunk_index, content,
                       1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM document_chunks
                WHERE document_id = :document_id
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
                """
            ),
            {"document_id": document_id, "embedding": vector_literal, "top_k": top_k},
        )
    ).mappings().all()

    return [
        {
            "document_id": str(document_id),
            "chunk_index": row["chunk_index"],
            "content": row["content"][:700],
            "similarity": round(float(row["similarity"]), 3),
        }
        for row in rows
    ]


async def search_across_documents(
    db: AsyncSession, user_id: uuid.UUID, query: str, top_k: int = DEFAULT_TOP_K
) -> list[dict[str, Any]]:
    """Cross-document semantic search scoped to a user (Roadmap Step 4)."""
    try:
        query_vector = await embed_question(query)
    except LLMServiceError as exc:
        raise AgentToolError(f"Embedding unavailable: {exc}") from exc

    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
    rows = (
        await db.execute(
            text(
                """
                SELECT dc.document_id, dc.chunk_index, dc.content,
                       1 - (dc.embedding <=> CAST(:embedding AS vector)) AS similarity,
                       d.original_filename
                FROM document_chunks dc
                JOIN documents d ON d.id = dc.document_id
                WHERE d.user_id = :user_id
                ORDER BY dc.embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
                """
            ),
            {"user_id": user_id, "embedding": vector_literal, "top_k": top_k},
        )
    ).mappings().all()

    return [
        {
            "document_id": str(row["document_id"]),
            "document_filename": row["original_filename"],
            "chunk_index": row["chunk_index"],
            "content": row["content"][:700],
            "similarity": round(float(row["similarity"]), 3),
        }
        for row in rows
    ]


async def get_document_metadata(
    db: AsyncSession, document_id: uuid.UUID, user_id: uuid.UUID
) -> dict[str, Any]:
    document_row = await db.execute(
        select(Document).where(Document.id == document_id, Document.user_id == user_id)
    )
    document = document_row.scalar_one_or_none()
    if not document:
        raise AgentToolError("Document not found")

    result_row = await db.execute(
        select(ProcessingResult)
        .join(Job, Job.id == ProcessingResult.job_id)
        .where(Job.document_id == document_id)
    )
    result = result_row.scalar_one_or_none()

    return {
        "document_id": str(document.id),
        "filename": document.original_filename,
        "file_type": document.file_type,
        "file_size": document.file_size,
        "title": result.title if result else None,
        "category": result.category if result else None,
        "word_count": result.word_count if result else None,
        "language": result.language if result else None,
        "is_finalized": result.is_finalized if result else False,
    }


async def list_user_documents(
    db: AsyncSession, user_id: uuid.UUID, status: str | None = None, limit: int = 20
) -> list[dict[str, Any]]:
    query = (
        select(Job)
        .options(selectinload(Job.document))
        .join(Job.document)
        .where(Document.user_id == user_id)
    )
    if status:
        query = query.where(Job.status == status)
    query = query.order_by(Job.created_at.desc()).limit(limit)

    rows = (await db.execute(query)).scalars().all()
    return [
        {
            "job_id": str(job.id),
            "document_id": str(job.document_id),
            "filename": job.document.original_filename if job.document else None,
            "status": job.status.value if hasattr(job.status, "value") else str(job.status),
            "created_at": job.created_at.isoformat(),
        }
        for job in rows
    ]


async def compare_documents(
    db: AsyncSession,
    user_id: uuid.UUID,
    document_id_a: uuid.UUID,
    document_id_b: uuid.UUID,
    query: str,
) -> dict[str, Any]:
    excerpts_a = await search_document_chunks(db, document_id_a, user_id, query, top_k=3)
    excerpts_b = await search_document_chunks(db, document_id_b, user_id, query, top_k=3)

    combined = [c["content"] for c in excerpts_a] + [c["content"] for c in excerpts_b]
    if not combined:
        raise AgentToolError("No relevant excerpts found in either document")

    try:
        comparison = await answer_document_question(query, combined)
    except LLMServiceError as exc:
        raise AgentToolError(f"Comparison synthesis unavailable: {exc}") from exc

    return {
        "document_id_a": str(document_id_a),
        "document_id_b": str(document_id_b),
        "excerpts_a": excerpts_a,
        "excerpts_b": excerpts_b,
        "comparison": comparison,
    }

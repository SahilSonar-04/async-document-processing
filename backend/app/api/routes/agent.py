"""Autonomous AI document research agent API endpoints."""

import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    AgentAnswerResponse,
    AgentHistoryResponse,
    AgentQueryHistoryItem,
    AgentStepResponse,
    QuestionRequest,
)
from app.services.agent import AgentError, get_agent_history, run_agent, run_agent_stream

router = APIRouter()


@router.post(
    "/agent/ask",
    response_model=AgentAnswerResponse,
    summary="Execute synchronous AI document research query",
    description="Runs the autonomous ReAct agent to search and reason across user documents synchronously.",
)
async def agent_ask(
    request: QuestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentAnswerResponse:
    """Execute autonomous document research agent query synchronously.

    Args:
        request: Natural language research question payload.
        db: Active asynchronous database session.
        current_user: Authenticated user entity.

    Returns:
        AgentAnswerResponse: Final synthesized answer, tool execution trace, and metrics.

    Raises:
        HTTPException: 503 if agent reasoning or LLM service fails.
    """
    try:
        result = await run_agent(db, current_user.id, request.question)
    except AgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AgentAnswerResponse(
        answer=result.answer,
        steps_taken=len(result.steps),
        tool_trace=[
            AgentStepResponse(tool=step.tool, args=step.args, result=step.result, error=step.error)
            for step in result.steps
        ],
        latency_ms=result.latency_ms,
        llm_call_count=result.llm_call_count,
    )


@router.get(
    "/agent/ask/stream",
    summary="Stream real-time agent reasoning steps via SSE",
    description="Streams ReAct reasoning and tool invocation events as they occur in real-time.",
)
async def agent_ask_stream(
    question: str = Query(..., min_length=3, max_length=1000, description="Natural language question"),
    token: str | None = Query(None, description="JWT authentication token for EventSource"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Stream real-time Server-Sent Events (SSE) from the agent ReAct reasoning loop.

    Emits `reasoning_started`, `tool_call_started`, `tool_call_completed`, `tool_call_failed`,
    `final_answer`, and `error` events.

    Args:
        question: Natural language question.
        token: Query-parameter JWT token for EventSource authentication.
        db: Active asynchronous database session.

    Returns:
        StreamingResponse: Text/event-stream response stream.

    Raises:
        HTTPException: 401 Unauthorized if token is missing or invalid.
    """
    subject = decode_access_token(token) if token else None
    if not subject:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_check = await db.execute(select(User.id).where(User.id == user_id))
    if not user_check.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="Invalid token")

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for event in run_agent_stream(db, user_id, question):
                yield _sse(event)
        except AgentError as exc:
            yield _sse({"event": "error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get(
    "/agent/history",
    response_model=AgentHistoryResponse,
    summary="List past agent research query logs",
    description="Retrieves chronological audit log of research queries and tool execution traces.",
)
async def agent_history(
    limit: int = Query(20, ge=1, le=100, description="Maximum number of historical queries to return"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentHistoryResponse:
    """Retrieve historical agent queries for the authenticated user.

    Args:
        limit: Maximum query records to return.
        db: Active asynchronous database session.
        current_user: Authenticated user entity.

    Returns:
        AgentHistoryResponse: List of historical agent queries with tool traces.
    """
    records = await get_agent_history(db, current_user.id, limit)
    return AgentHistoryResponse(
        items=[
            AgentQueryHistoryItem(
                id=record.id,
                question=record.question,
                answer=record.answer,
                steps_taken=record.steps_taken,
                tool_trace=[AgentStepResponse(**step) for step in record.tool_trace],
                created_at=record.created_at,
                latency_ms=record.latency_ms,
                llm_call_count=record.llm_call_count,
            )
            for record in records
        ]
    )

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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


@router.post("/agent/ask", response_model=AgentAnswerResponse)
async def agent_ask(
    request: QuestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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


@router.get("/agent/ask/stream")
async def agent_ask_stream(
    question: str = Query(..., min_length=3, max_length=1000),
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    SSE variant of POST /agent/ask. Streams reasoning_started / tool_call_started /
    tool_call_completed / tool_call_failed / final_answer / error events as the
    agent's ReAct loop produces them.

    EventSource can't set an Authorization header, so — same pattern as
    /jobs/{id}/progress — auth is passed as a query param and validated here.
    """
    subject = decode_access_token(token) if token else None
    if not subject:
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token")

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    async def event_generator():
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


@router.get("/agent/history", response_model=AgentHistoryResponse)
async def agent_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

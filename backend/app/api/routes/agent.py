from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    AgentAnswerResponse,
    AgentHistoryResponse,
    AgentQueryHistoryItem,
    AgentStepResponse,
    QuestionRequest,
)
from app.services.agent import AgentError, get_agent_history, run_agent

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
            )
            for record in records
        ]
    )

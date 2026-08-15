from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import AgentAnswerResponse, AgentStepResponse, QuestionRequest
from app.services.agent import AgentError, run_agent

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

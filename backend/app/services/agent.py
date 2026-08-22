"""Autonomous ReAct document research agent implementation using Google GenAI SDK.

This module coordinates multi-step document reasoning:
- ReAct loop driven by Gemini function calling with bounded iterations (`MAX_STEPS = 4`).
- Real-time Server-Sent Events (SSE) streaming of reasoning steps, tool dispatches, and final answers.
- Fallback non-streaming executor (`run_agent`).
- Persistent query trace logging into the `agent_queries` table for historical auditability.
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import AgentQuery
from app.services import agent_tools

MAX_STEPS = 4

_AGENT_SYSTEM_PROMPT = """You are a document research assistant with access to tools that
search and inspect the user's uploaded documents. Use tools to gather evidence before
answering. Only answer from what the tools return; do not invent document contents.
When you have enough information, respond with a final plain-text answer and stop
calling tools. If the tools don't find relevant information, say so honestly."""

_TOOL_DECLARATIONS = [
    types.FunctionDeclaration(
        name="search_document_chunks",
        description="Semantic search within a single document for chunks relevant to a query.",
        parameters={
            "type": "object",
            "properties": {
                "document_id": {"type": "string", "description": "UUID of the document to search"},
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["document_id", "query"],
        },
    ),
    types.FunctionDeclaration(
        name="search_across_documents",
        description="Semantic search across all of the user's documents for chunks relevant to a query.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
    ),
    types.FunctionDeclaration(
        name="get_document_metadata",
        description="Get title, category, word count, language, and finalization status for a document.",
        parameters={
            "type": "object",
            "properties": {
                "document_id": {"type": "string", "description": "UUID of the document"},
            },
            "required": ["document_id"],
        },
    ),
    types.FunctionDeclaration(
        name="list_user_documents",
        description="List the user's uploaded documents, optionally filtered by status.",
        parameters={
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Optional job status filter: queued, processing, completed, failed, cancelled",
                },
            },
        },
    ),
    types.FunctionDeclaration(
        name="compare_documents",
        description="Retrieve relevant excerpts from two documents and synthesize a comparison for a query.",
        parameters={
            "type": "object",
            "properties": {
                "document_id_a": {"type": "string", "description": "UUID of the first document"},
                "document_id_b": {"type": "string", "description": "UUID of the second document"},
                "query": {"type": "string", "description": "What to compare"},
            },
            "required": ["document_id_a", "document_id_b", "query"],
        },
    ),
]


@dataclass
class AgentStep:
    """Represents an individual tool call executed during agent reasoning.

    Attributes:
        tool: Identifier of the tool executed.
        args: Input argument dictionary provided by the model.
        result: Output payload returned by the tool execution.
        error: Error message string if tool execution failed.
    """
    tool: str
    args: dict[str, Any]
    result: Any = None
    error: str | None = None


@dataclass
class AgentResult:
    """Final result container from an agent execution session.

    Attributes:
        answer: Synthesized final natural language answer.
        steps: Chronological list of tool invocation steps.
        latency_ms: Total elapsed time in milliseconds.
        llm_call_count: Total LLM completions generated during the session.
    """
    answer: str
    steps: list[AgentStep] = field(default_factory=list)
    latency_ms: int = 0
    llm_call_count: int = 0


class AgentError(RuntimeError):
    """Raised when agent configuration, reasoning, or tool dispatching fails."""
    pass


async def _persist_query(
    db: AsyncSession, user_id: uuid.UUID, question: str, result: AgentResult
) -> None:
    """Record completed agent query execution trace in the database.

    Args:
        db: Active asynchronous database session.
        user_id: Authenticated user UUID.
        question: User's original prompt.
        result: Completed agent result containing answer, steps, and metrics.
    """
    record = AgentQuery(
        user_id=user_id,
        question=question,
        answer=result.answer,
        tool_trace=[
            {"tool": step.tool, "args": step.args, "result": step.result, "error": step.error}
            for step in result.steps
        ],
        steps_taken=len(result.steps),
        latency_ms=result.latency_ms,
        llm_call_count=result.llm_call_count,
    )
    db.add(record)
    await db.commit()


async def get_agent_history(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 20
) -> list[AgentQuery]:
    """Fetch past agent query audit records for the authenticated user.

    Args:
        db: Active asynchronous database session.
        user_id: Authenticated user UUID.
        limit: Maximum records to return (default: 20).

    Returns:
        list[AgentQuery]: Ordered list of historical agent query records.
    """
    query = (
        select(AgentQuery)
        .where(AgentQuery.user_id == user_id)
        .order_by(AgentQuery.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def _dispatch_tool(
    db: AsyncSession, user_id: uuid.UUID, name: str, args: dict[str, Any]
) -> Any:
    """Route tool invocation requests to corresponding handler functions.

    Args:
        db: Active asynchronous database session.
        user_id: Authenticated user UUID.
        name: Name of tool requested by the model.
        args: Argument dictionary provided by the model.

    Returns:
        Any: Tool execution output payload.

    Raises:
        AgentError: If tool name is unrecognized.
    """
    if name == "search_document_chunks":
        return await agent_tools.search_document_chunks(
            db, uuid.UUID(args["document_id"]), user_id, args["query"]
        )
    if name == "search_across_documents":
        return await agent_tools.search_across_documents(db, user_id, args["query"])
    if name == "get_document_metadata":
        return await agent_tools.get_document_metadata(db, uuid.UUID(args["document_id"]), user_id)
    if name == "list_user_documents":
        return await agent_tools.list_user_documents(db, user_id, args.get("status"))
    if name == "compare_documents":
        return await agent_tools.compare_documents(
            db,
            user_id,
            uuid.UUID(args["document_id_a"]),
            uuid.UUID(args["document_id_b"]),
            args["query"],
        )
    raise AgentError(f"Unknown tool: {name}")


async def run_agent_stream(
    db: AsyncSession, user_id: uuid.UUID, question: str
) -> AsyncGenerator[dict[str, Any], None]:
    """Execute the ReAct agent loop yielding real-time events for SSE streaming.

    Yields events:
    - `reasoning_started`: Indicates start of a reasoning iteration.
    - `tool_call_started`: Dispatched before invoking a tool.
    - `tool_call_completed`: Emitted upon successful tool execution.
    - `tool_call_failed`: Emitted if tool execution encounters an error.
    - `final_answer`: Emitted when model concludes reasoning with a final answer.
    - `error`: Emitted on timeouts, unhandled exceptions, or loop divergence.

    Args:
        db: Active asynchronous database session.
        user_id: Authenticated user UUID.
        question: User's input prompt.

    Yields:
        dict[str, Any]: SSE event payload dictionary.

    Raises:
        AgentError: If reasoning times out, fails, or does not converge within `MAX_STEPS`.
    """
    if not settings.gemini_api_key:
        raise AgentError("GEMINI_API_KEY is not configured")

    started_at = time.perf_counter()
    client = genai.Client(api_key=settings.gemini_api_key)
    config = types.GenerateContentConfig(
        system_instruction=_AGENT_SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=_TOOL_DECLARATIONS)],
        max_output_tokens=settings.llm_max_output_tokens,
    )

    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=question)])
    ]
    steps: list[AgentStep] = []
    llm_call_count = 0

    for step_num in range(MAX_STEPS):
        yield {"event": "reasoning_started", "step": step_num + 1}

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.llm_model, contents=contents, config=config
                ),
                timeout=settings.llm_request_timeout_seconds,
            )
            llm_call_count += 1
        except asyncio.TimeoutError as exc:
            yield {"event": "error", "message": "Agent step timed out"}
            raise AgentError("Agent step timed out") from exc
        except Exception as exc:
            yield {"event": "error", "message": str(exc)}
            raise AgentError(str(exc)) from exc

        candidate = response.candidates[0] if response.candidates else None
        parts = candidate.content.parts if candidate and candidate.content else []
        function_calls = [part.function_call for part in parts if getattr(part, "function_call", None)]

        if not function_calls:
            answer = (response.text or "").strip()
            if not answer:
                yield {"event": "error", "message": "Agent returned an empty answer"}
                raise AgentError("Agent returned an empty answer")

            latency_ms = round((time.perf_counter() - started_at) * 1000)
            result = AgentResult(
                answer=answer,
                steps=steps,
                latency_ms=latency_ms,
                llm_call_count=llm_call_count,
            )
            await _persist_query(db, user_id, question, result)

            yield {
                "event": "final_answer",
                "answer": answer,
                "steps_taken": len(steps),
                "latency_ms": latency_ms,
                "llm_call_count": llm_call_count,
            }
            return

        contents.append(candidate.content)
        function_response_parts = []

        for call in function_calls:
            args = dict(call.args or {})
            step = AgentStep(tool=call.name, args=args)
            yield {"event": "tool_call_started", "tool": call.name, "args": args}

            try:
                tool_result = await asyncio.wait_for(
                    _dispatch_tool(db, user_id, call.name, args),
                    timeout=settings.llm_request_timeout_seconds,
                )
                step.result = tool_result
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"result": tool_result})
                )
                yield {"event": "tool_call_completed", "tool": call.name, "result": tool_result}
            except asyncio.TimeoutError:
                step.error = "Tool call timed out"
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
                yield {"event": "tool_call_failed", "tool": call.name, "error": step.error}
            except agent_tools.AgentToolError as exc:
                step.error = str(exc)
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
                yield {"event": "tool_call_failed", "tool": call.name, "error": step.error}
            except Exception as exc:
                step.error = str(exc)
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
                yield {"event": "tool_call_failed", "tool": call.name, "error": step.error}

            steps.append(step)

        contents.append(types.Content(role="user", parts=function_response_parts))

    yield {"event": "error", "message": f"Agent did not converge within {MAX_STEPS} steps"}
    raise AgentError(f"Agent did not converge within {MAX_STEPS} steps")


async def run_agent(db: AsyncSession, user_id: uuid.UUID, question: str) -> AgentResult:
    """Execute the agent synchronously by draining the streaming event generator.

    Args:
        db: Active asynchronous database session.
        user_id: Authenticated user UUID.
        question: User's input prompt.

    Returns:
        AgentResult: Completed answer, step trace, latency, and LLM call counts.

    Raises:
        AgentError: If the agent fails to converge or returns an error.
    """
    steps: list[AgentStep] = []
    pending_args: dict[str, dict[str, Any]] = {}
    final_event: dict[str, Any] | None = None

    async for event in run_agent_stream(db, user_id, question):
        if event["event"] == "tool_call_started":
            pending_args[event["tool"]] = event["args"]
        elif event["event"] == "tool_call_completed":
            steps.append(
                AgentStep(
                    tool=event["tool"],
                    args=pending_args.get(event["tool"], {}),
                    result=event["result"],
                )
            )
        elif event["event"] == "tool_call_failed":
            steps.append(
                AgentStep(
                    tool=event["tool"],
                    args=pending_args.get(event["tool"], {}),
                    error=event["error"],
                )
            )
        elif event["event"] == "final_answer":
            final_event = event

    if final_event is None:
        raise AgentError("Agent did not produce a final answer")

    return AgentResult(
        answer=final_event["answer"],
        steps=steps,
        latency_ms=final_event["latency_ms"],
        llm_call_count=final_event["llm_call_count"],
    )

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
    tool: str
    args: dict[str, Any]
    result: Any = None
    error: str | None = None


@dataclass
class AgentResult:
    answer: str
    steps: list[AgentStep] = field(default_factory=list)


class AgentError(RuntimeError):
    pass


async def _dispatch_tool(
    db: AsyncSession, user_id: uuid.UUID, name: str, args: dict[str, Any]
) -> Any:
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


async def run_agent(db: AsyncSession, user_id: uuid.UUID, question: str) -> AgentResult:
    if not settings.gemini_api_key:
        raise AgentError("GEMINI_API_KEY is not configured")

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

    for _ in range(MAX_STEPS):
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.llm_model, contents=contents, config=config
                ),
                timeout=settings.llm_request_timeout_seconds,
            )
        except asyncio.TimeoutError as exc:
            raise AgentError("Agent step timed out") from exc
        except Exception as exc:
            raise AgentError(str(exc)) from exc

        candidate = response.candidates[0] if response.candidates else None
        parts = candidate.content.parts if candidate and candidate.content else []
        function_calls = [part.function_call for part in parts if getattr(part, "function_call", None)]

        if not function_calls:
            answer = (response.text or "").strip()
            if not answer:
                raise AgentError("Agent returned an empty answer")
            return AgentResult(answer=answer, steps=steps)

        contents.append(candidate.content)
        function_response_parts = []

        for call in function_calls:
            args = dict(call.args or {})
            step = AgentStep(tool=call.name, args=args)
            try:
                result = await asyncio.wait_for(
                    _dispatch_tool(db, user_id, call.name, args),
                    timeout=settings.llm_request_timeout_seconds,
                )
                step.result = result
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"result": result})
                )
            except asyncio.TimeoutError:
                step.error = "Tool call timed out"
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
            except agent_tools.AgentToolError as exc:
                step.error = str(exc)
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
            except Exception as exc:
                step.error = str(exc)
                function_response_parts.append(
                    types.Part.from_function_response(name=call.name, response={"error": step.error})
                )
            steps.append(step)

        contents.append(types.Content(role="user", parts=function_response_parts))

    raise AgentError(f"Agent did not converge within {MAX_STEPS} steps")

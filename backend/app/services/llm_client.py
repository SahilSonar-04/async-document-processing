import asyncio
import json
import re
import time
from dataclasses import dataclass
from typing import Any

from app.core.config import settings


_CATEGORIES = {"document", "text", "data", "documentation", "other"}
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_EXTRACTION_SYSTEM_PROMPT = """You extract structured metadata from document text.
Return only a JSON object with title, category, summary, and keywords. Category must be one of: document, text, data, documentation, other. Write a concise factual summary in two or three sentences. Return at most eight concise keywords. Do not include markdown, explanations, or fields not requested."""
_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "category": {"type": "string", "enum": sorted(_CATEGORIES)},
        "summary": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
    },
    "required": ["title", "category", "summary", "keywords"],
}


class LLMExtractionError(RuntimeError):
    pass


@dataclass
class LLMExtraction:
    fields: dict[str, Any]
    metadata: dict[str, int | str | bool]


def _parse_llm_json(raw: str) -> dict[str, Any]:
    cleaned = _FENCE_RE.sub("", raw.strip()).strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("LLM response must be a JSON object")
    return parsed


def _usage_metadata(response: Any) -> dict[str, int | None]:
    usage = getattr(response, "usage_metadata", None)
    return {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "completion_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }


def _normalise_fields(parsed: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    title = parsed.get("title")
    summary = parsed.get("summary")
    category = parsed.get("category")
    keywords = parsed.get("keywords")

    if not isinstance(title, str) or not title.strip():
        title = baseline["title"]
    if not isinstance(summary, str) or not summary.strip():
        summary = baseline["summary"]
    if category not in _CATEGORIES:
        category = baseline["category"]
    if not isinstance(keywords, list):
        keywords = baseline["keywords"]

    unique_keywords: list[str] = []
    seen: set[str] = set()
    for keyword in keywords:
        if not isinstance(keyword, str):
            continue
        cleaned = keyword.strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            unique_keywords.append(cleaned)
        if len(unique_keywords) == 8:
            break

    return {
        "title": title.strip(),
        "category": category,
        "summary": summary.strip(),
        "keywords": unique_keywords,
        "word_count": baseline["word_count"],
        "language": baseline["language"],
    }


async def extract_fields_llm(
    text: str, filename: str, baseline: dict[str, Any]
) -> LLMExtraction:
    if settings.llm_provider.lower() != "gemini":
        raise LLMExtractionError(f"Unsupported LLM provider: {settings.llm_provider}")
    if not settings.gemini_api_key:
        raise LLMExtractionError("GEMINI_API_KEY is not configured")

    try:
        from google import genai

        text_for_model = text[: settings.llm_max_input_characters]
        prompt = f"Filename: {filename}\n\nDocument text:\n{text_for_model}"
        client = genai.Client(api_key=settings.gemini_api_key)
        started_at = time.perf_counter()
        usage = {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}
        repaired = False

        async def generate(contents: str):
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=settings.llm_model,
                    contents=contents,
                    config={
                    "system_instruction": _EXTRACTION_SYSTEM_PROMPT,
                    "response_mime_type": "application/json",
                    "response_json_schema": _EXTRACTION_SCHEMA,
                    "max_output_tokens": settings.llm_max_output_tokens,
                    },
                ),
                timeout=settings.llm_request_timeout_seconds,
            )
            response_usage = _usage_metadata(response)
            for key, value in response_usage.items():
                if value is not None:
                    usage[key] = (usage[key] or 0) + value
            return response.text or ""

        raw = await generate(prompt)
        try:
            parsed = _parse_llm_json(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            repaired = True
            repair_prompt = (
                "The response below was not valid JSON. Return a corrected response that "
                "matches the required JSON object exactly, with no markdown or explanation.\n\n"
                f"Invalid response:\n{raw[:8000]}"
            )
            parsed = _parse_llm_json(await generate(repair_prompt))
    except Exception as exc:
        raise LLMExtractionError(str(exc)) from exc

    metadata: dict[str, int | str | bool] = {
        "provider": "gemini",
        "model": settings.llm_model,
        "latency_ms": round((time.perf_counter() - started_at) * 1000),
        "input_truncated": len(text) > len(text_for_model),
        "json_repaired": repaired,
    }
    metadata.update({key: value for key, value in usage.items() if value is not None})
    return LLMExtraction(fields=_normalise_fields(parsed, baseline), metadata=metadata)

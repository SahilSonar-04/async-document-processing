# Agent Notes

## Tools available to the agent
- `search_document_chunks(document_id, query)` — pgvector cosine similarity search within one document.
- `search_across_documents(query)` — the same search joined across all of the user's documents.
- `get_document_metadata(document_id)` — title, category, word count, language, finalization status.
- `list_user_documents(status?)` — the user's jobs/documents, optionally filtered by status.
- `compare_documents(document_id_a, document_id_b, query)` — retrieves excerpts from two documents and synthesizes a comparison.

## Why a step cap
The loop is capped at `MAX_STEPS = 4` tool-call rounds. An uncapped agent can loop indefinitely against a stubborn model or spiral into rambling multi-hop searches on a system serving synchronous HTTP requests. Four rounds covers the tools above (a single lookup, a cross-document search, or a two-document compare) while keeping worst-case latency bounded and predictable — the same bounded-timeout philosophy already used for `LLM_REQUEST_TIMEOUT_SECONDS` in the classical extraction path.

## Per-call timeout
Every model call and every tool call is wrapped in `asyncio.wait_for` with `LLM_REQUEST_TIMEOUT_SECONDS` (the same setting used elsewhere), so a hung Gemini call or a slow pgvector query can't stall the request indefinitely.

## What a fuller agent would add
This is a bounded ReAct-style loop, not a planning agent: no long-term memory across requests, no self-critique/re-planning step, no parallel tool calls, and no learned tool ranking — Gemini picks tools per-turn from a fixed schema. A fuller implementation would add persistent conversation memory (so follow-up questions don't re-search from scratch), a planning step that decomposes multi-part questions before executing tools, and usage-based tool ranking. Those are deliberately out of scope here: the goal was a working, inspectable, bounded agent on top of existing retrieval code, not a general-purpose planner.

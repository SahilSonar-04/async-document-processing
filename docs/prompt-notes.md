# Prompt notes

## v1: free-form extraction

The initial instruction asked Gemini to extract a title, category, summary, and keywords. It occasionally returned explanatory prose around the JSON, which made parsing unreliable.

## v2: JSON-only instruction

The prompt now explicitly requests a single JSON object, prohibits markdown and extra fields, limits keywords to eight, and constrains categories to the values used by DocFlow.

## v3: schema plus repair fallback

Gemini JSON mode is paired with a response schema. If parsing still fails, the worker makes one bounded repair request. A second malformed response or an API failure uses the classical extraction result so document processing can complete.

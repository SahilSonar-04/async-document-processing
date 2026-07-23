# DocFlow

A document processing app: upload a file, watch it get processed in the background,
review what got extracted, edit it, finalize it, export it. Built to practice a full
async pipeline — API, task queue, live progress over SSE, a proper worker — rather
than just another CRUD app.

Stack: FastAPI + Celery + Redis + Postgres on the backend, Next.js + TypeScript on
the frontend. Everything runs in Docker Compose.

## Why this exists

I wanted something that exercised background job processing end to end — not just
"click button, wait, get result" but actual multi-stage processing with live progress,
retries, and a review/edit step before the result is considered final. Document
"extraction" here means real text extraction (PDF via pypdf, DOCX via python-docx,
plain text/CSV/JSON/MD read directly) plus a small extractive-summarization and
RAKE-keyword pipeline — not an LLM call, just classic NLP. Good enough to be honestly
useful for short-to-medium documents, not going to compete with anything backed by an
actual model.

## Running it

```bash
git clone <repo-url>
cd docflow
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Flower (Celery monitor): http://localhost:5555

To generate some test files and upload them automatically:

```bash
chmod +x scripts/seed.sh
./scripts/seed.sh --upload
```

## How it fits together

Upload hits the FastAPI backend, which validates the file, streams it to disk, writes
a `Document` + `Job` row, and hands the job to Celery. It returns immediately — the
actual work happens in the worker. The worker runs through seven stages (parse ->
extract fields -> summarize -> store) and publishes progress after each one. The
frontend subscribes to a per-job SSE stream and updates the progress bar live.

Redis does double duty as the Celery broker and the pub/sub channel for progress
events. On Render's free tier, the managed Redis instance blocks `SUBSCRIBE`, so
there's a polling fallback that reads the same job status out of a Redis key on a
timer instead — same events, slower delivery, no pub/sub required. `SSE_MODE` in the
env controls which path is active.

Once a job completes, you land on a review screen: edit the extracted title, category,
summary, keywords, then finalize. Finalizing locks the record from further edits.
Export pulls finalized (or all completed) records as JSON or CSV.

## What's actually happening in "extraction"

No ML here on purpose — wanted to see how far you get with straightforward text
processing before reaching for an LLM.

- **Summarization**: sentence splitting, then a frequency-weighted score per sentence
  (mild bias toward earlier sentences), top-N picked and put back in original order.
  Basically TextRank's simpler cousin.
- **Keywords**: RAKE — sentences get split into stopword-delimited candidate phrases,
  phrases scored by word co-occurrence degree over frequency.
- **Language detection**: via `langdetect`, not a heuristic.
- **DOCX**: `python-docx`, pulls paragraph text and table cell contents.
- **PDF**: `pypdf`, page-by-page text extraction (doesn't handle scanned/image PDFs —
  no OCR).

It's not going to write a great summary of a 40-page report. For short documents
(a few paragraphs to a couple pages) it does a reasonable job.

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/upload` | Upload one document |
| POST | `/api/v1/upload/bulk` | Upload several at once (max 20/request) |
| GET | `/api/v1/jobs` | List jobs — search, filter, sort, paginate |
| GET | `/api/v1/jobs/{id}` | Job detail + result |
| GET | `/api/v1/jobs/{id}/progress` | SSE progress stream |
| POST | `/api/v1/jobs/{id}/retry` | Retry a failed job |
| PATCH | `/api/v1/jobs/{id}/result` | Edit extracted fields (pre-finalize) |
| POST | `/api/v1/jobs/{id}/finalize` | Lock the result |
| GET | `/api/v1/export/json` | Export results |
| GET | `/api/v1/export/csv` | Export results |

## Decisions worth explaining

**SSE over WebSockets** — progress only flows server to client, so a full duplex
connection is more machinery than the problem needs.

**File bytes backed up in Postgres** — Render's free tier wipes `/tmp` on restart, so
disk alone isn't reliable storage between upload and processing. The DB keeps a copy
until the job either finishes or exhausts its retries, at which point it's cleared.
It's a workaround for a free-tier constraint, not something I'd do with real
infrastructure — S3 or similar would be the actual answer.

**Poll fallback for SSE** — see above. It's uglier than pure pub/sub but it means the
demo actually works on infra that doesn't support pub/sub, instead of silently hanging.

**Structured fields + raw JSON, both stored** — editing the structured fields (title,
summary, etc.) never touches the original extraction, which stays in `raw_json`. Felt
like the safer default for a "review and edit" workflow.

## Known rough edges

Being upfront about what's not solid, roughly in order of how much I'd worry about them:

- No auth. Every endpoint is open. Fine for a local demo, not fine for anything real.
- No automated tests yet — this is next on my list.
- `Base.metadata.create_all()` runs on startup instead of real migrations. Alembic is
  in `requirements.txt` but not actually wired up.
- No rate limiting anywhere.
- Bulk upload is capped at 20 files/request and streamed to disk with a size limit
  enforced during the read (not after), but there's still no per-IP throttling.
- Export endpoints load the whole result set into memory — fine at demo scale, would
  need pagination for anything bigger.
- Filenames get sanitized against path traversal, but that's the extent of the input
  hardening — no virus scanning, no content-type sniffing beyond the extension.
- Flower (the Celery dashboard) has zero auth, which is fine on localhost and would
  not be fine anywhere public.

## Repo layout

```
backend/
  app/
    api/routes/       — FastAPI route handlers
    services/          — business logic (document/job orchestration)
    workers/           — Celery app + the processing task
    models/, schemas/  — SQLAlchemy models, Pydantic schemas
    db/                — session/engine setup, Redis client
frontend/
  src/
    pages/             — Next.js pages (dashboard, upload, job detail)
    components/        — UI components
    hooks/             — useSSE / useMultiSSE / useJobs
    store/              — Zustand store
    lib/                — API client, utils
```

## Stack

FastAPI, SQLAlchemy (async) + Postgres, Celery + Redis, Next.js 14, TypeScript,
Tailwind, Zustand. Everything containerized via Docker Compose.
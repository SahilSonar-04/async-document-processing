# DocFlow

Upload a document, watch it get processed in the background, review what got
extracted, edit it, finalize it, export it. Ask questions about a single
document, or let an agent dig across all of them. Built to practice a real
async pipeline — API, task queue, live progress, auth, vector search, and a
tool-calling agent — not just another CRUD app.

Stack: FastAPI + Celery + Redis + Postgres/pgvector on the backend, Next.js +
TypeScript on the frontend. Everything runs in Docker Compose.

## Running it

```bash
git clone <https://github.com/SahilSonar-04/async-document-processing>
cd docflow
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

Set `GEMINI_API_KEY` in `backend/.env` if you want the AI extraction mode,
document Q&A, or the multi-document agent — all three depend on it. Classical
extraction is the default and doesn't need a key. The backend container runs
`alembic upgrade head` before starting uvicorn, so migrations apply
automatically — nothing to run by hand.

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Flower (Celery monitor): http://localhost:5555

```bash
chmod +x scripts/seed.sh
./scripts/seed.sh --upload
```

Locally, the API and the Celery worker run in separate containers
(`backend` and `worker` in `docker-compose.yml`), so the worker gets real
concurrency (`--concurrency=4`). That's not how it runs in production — see
Deploying below.

## Auth

Every document belongs to a user. JWT bearer tokens, bcrypt-hashed passwords,
`/auth/register`, `/auth/login`, `/auth/me`. There's no email verification or
password reset — it's just enough to make ownership real. All job, document,
export, Q&A, and agent endpoints check `document.user_id` / `document.owner`
against the current user, so one account can't see another's files.

SSE endpoints (job progress, agent streaming) can't send an `Authorization`
header from `EventSource`, so those take the JWT as a `?token=` query param
instead and validate it the same way.

## How a document moves through the system

1. Upload hits FastAPI, which validates extension/size, streams the file to
   disk, and also keeps a copy of the bytes in Postgres (`file_content`).
   Creates a `Document` + `Job` row and hands off to Celery. Returns
   immediately.
2. The worker runs through several stages — parse, extract, embed, store —
   updating job progress after each one and publishing an event.
3. The frontend subscribes to a per-job SSE stream and updates the progress
   bar live.
4. On completion you land on a review screen: edit title/category/
   summary/keywords, then finalize. Finalizing locks the record.
5. Export finalized (or all completed) records as JSON or CSV.

Redis is both the Celery broker and the pub/sub channel for progress events.
Render's free Redis tier blocks `SUBSCRIBE`, so there's a DB-polling fallback
for the SSE endpoint that reads the same job status off a Redis key on a
timer instead. `SSE_MODE` (`pubsub` or `poll`) picks which path runs.

The API talks to Postgres over async SQLAlchemy (`asyncpg`), but the Celery
worker uses a plain sync SQLAlchemy session (`psycopg2`) — Celery tasks
aren't async, so there's no point dragging the async engine into the worker
process. That's also why the declarative `Base` lives in its own
`db/base.py` file, separate from `db/session.py`: it lets the worker import
the models without ever touching the async engine setup.

## Extraction

Two independent modes, picked per-upload:

**Classical (default, no API key needed)**
- Text pulled directly for txt/csv/json/md, via `pypdf` for PDFs (no OCR —
  scanned PDFs won't extract), via `python-docx` for Word (paragraphs +
  table cells).
- A normalization pass merges bullet fragments and short trailing lines back
  into full sentences before anything else runs.
- Summarization: frequency-weighted sentence scoring with a mild bias toward
  earlier sentences, top-N picked and reordered back to original position.
  Roughly TextRank's simpler cousin.
- Keywords: RAKE — stopword-delimited candidate phrases scored by
  word co-occurrence degree over frequency.
- Language detection via `langdetect`.

**AI (Gemini)**
- Same baseline fields as a fallback. Calls Gemini with a JSON schema for
  title/category/summary/keywords, one repair attempt if the response isn't
  valid JSON, then falls back to the classical result if it still fails.
  Model, token, and latency metadata gets stored alongside the raw
  extraction so you can compare cost/quality against the classical path.

Both extraction paths are exposed as a toggle at upload time; nothing forces
you into one or the other.

## Document Q&A + the agent

Every successfully processed document gets word-window chunked (with
overlap) and embedded with Gemini Embedding 2 into pgvector, indexed with
an HNSW index (`vector_cosine_ops`) for the similarity search.

- **Single-document Q&A** (`POST /jobs/{id}/ask`): embeds the question,
  pulls the 5 closest chunks by cosine similarity, and has Gemini answer
  strictly from those excerpts — it's told to ignore any instructions inside
  the excerpts themselves and to say so if the answer isn't there. The UI
  shows the retrieved snippets and their similarity scores next to the
  answer.
- **Cross-document agent** (`/ask` page, `POST /agent/ask` or the SSE
  variant): a small ReAct-style loop with five tools — search within a
  document, search across all of a user's documents, look up document
  metadata, list documents, compare two documents. Capped at 4 tool-call
  rounds so a stubborn model can't spiral into an unbounded chain on a
  synchronous request. Every call (model and tool) is wrapped in a timeout.
  Answered questions and their full tool trace get persisted
  (`agent_queries`) so the history panel can replay past runs without
  re-querying anything.

If embedding failed for a document (or Gemini isn't configured), extraction
still completes — Q&A just reports the index isn't available instead of
failing the whole job.

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Create an account |
| POST | `/api/v1/auth/login` | Get a bearer token |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/upload` | Upload one document |
| POST | `/api/v1/upload/bulk` | Upload several (max 20/request) |
| GET | `/api/v1/jobs` | List jobs — search, filter, sort, paginate |
| GET | `/api/v1/jobs/{id}` | Job detail + result |
| GET | `/api/v1/jobs/{id}/progress` | SSE progress stream |
| POST | `/api/v1/jobs/{id}/retry` | Retry a failed/cancelled job |
| PATCH | `/api/v1/jobs/{id}/result` | Edit extracted fields (pre-finalize) |
| POST | `/api/v1/jobs/{id}/finalize` | Lock the result |
| POST | `/api/v1/jobs/{id}/ask` | Answer a question from this document's chunks |
| POST | `/api/v1/agent/ask` | Ask across all documents (tool-calling agent) |
| GET | `/api/v1/agent/ask/stream` | SSE variant of the above |
| GET | `/api/v1/agent/history` | Past agent questions + tool traces |
| GET | `/api/v1/export/json` | Export results |
| GET | `/api/v1/export/csv` | Export results |

## Database & migrations

Schema changes live in `backend/alembic/`, one revision file per change
(initial schema, extraction mode, pgvector chunks, users, agent queries,
agent metrics). Every migration checks the current state first — `if "users"
not in tables`, `if "extraction_mode" not in columns`, and so on — before
creating anything, so they're safe to run against a database that's already
partway migrated. That matters because `start.sh` runs `alembic upgrade
head` on every deploy, not just the first one.

`alembic/env.py` pulls the connection string from `settings.sync_database_url`
rather than the async one FastAPI uses at runtime — Alembic itself is sync,
so migrations always go through psycopg2, never asyncpg.

## Testing & CI

Backend tests live in `backend/tests/`, split into `unit/` (extraction
logic, the agent's ReAct loop with a mocked Gemini client, LLM JSON
parsing/repair) and `integration/` (auth, upload, job lifecycle — real HTTP
calls against the FastAPI app with a real Postgres test database).
`pytest-asyncio` is set to `auto` mode so async test functions just work
without decorators. Frontend tests are Jest + Testing Library, colocated
next to the components/hooks they cover.

Two GitHub Actions workflows, each only triggering when its half of the repo
changes:

- **backend-ci.yml** — spins up `pgvector/pgvector:pg16` and `redis:7-alpine`
  as services, installs `requirements-dev.txt`, runs `ruff` (deliberately
  narrow — just syntax and undefined-name errors, not full style linting),
  then `pytest --cov=app`. A separate job just builds the backend Dockerfile
  to catch breakage there too.
- **frontend-ci.yml** — `npm ci`, `next lint`, `tsc --noEmit`, `jest
  --coverage`, `next build`. Same pattern with a separate Docker build job.

`docker-compose.test.yml` mirrors CI locally — a throwaway Postgres on port
5433 (tmpfs-backed, wiped on exit), a backend container that installs dev
deps and runs the same pytest command, and a frontend container running
`npm test`. Useful for reproducing a CI failure without waiting on GitHub.

## Deploying

`render.yaml` deploys to Render's free tier, and its comments are basically
a list of everything that's different between local dev and there:

- Render's managed Redis free tier doesn't support `SUBSCRIBE`, so
  `SSE_MODE` is set to `poll` in production even though `pubsub` is the
  local default.
- Local disk is wiped on every restart, so `UPLOAD_DIR` points at `/tmp`
  and the Postgres `file_content` backup (see below) is what actually keeps
  uploads alive across a redeploy.
- The free tier is one dyno, so `start.sh` runs the Celery worker in the
  background (`--pool=solo`, one task at a time, `--max-tasks-per-child=50`
  to keep memory in check) and the FastAPI server in the foreground of the
  same process — a very different concurrency story from the two-container
  local setup.
- `DATABASE_URL` comes back from Render as a single `postgres://` string;
  `start.sh` splits it into an asyncpg URL for FastAPI and a separate
  psycopg2 URL for the worker, since they need different drivers.

## Decisions worth explaining

**SSE over WebSockets** — progress and agent reasoning only flow server to
client, so a full duplex connection is more machinery than the problem
needs.

**File bytes backed up in Postgres** — Render's free tier wipes local disk
on restart, so disk alone isn't reliable storage between upload and
processing. The DB keeps a copy until the job finishes or exhausts retries,
then it's cleared. A workaround for a free-tier constraint, not something
I'd do with real infrastructure — object storage would be the actual answer.

**Poll fallback for SSE** — uglier than pure pub/sub, but it means progress
and agent streaming still work on infra that doesn't support `SUBSCRIBE`,
instead of silently hanging.

**Structured fields + raw JSON, both stored** — editing title/summary/etc.
never touches the original extraction, which stays in `raw_json`. Felt like
the safer default for a review-and-edit workflow.

**4-step cap on the agent** — an uncapped tool-calling loop against a
synchronous HTTP request can spiral. Four rounds covers a single lookup, a
cross-document search, or a two-document compare, while keeping worst-case
latency bounded.

**Q&A treats retrieved chunks as untrusted data** — the RAG prompt
explicitly tells the model to ignore any instructions embedded in the
excerpts. Documents are user-uploaded content; nothing in them should be
able to redirect the model's behavior.

**Idempotent migrations** — every Alembic revision checks for the table/
column/constraint it's about to add before adding it. Since `start.sh` runs
`alembic upgrade head` on every deploy rather than only the first one, this
keeps redeploys from failing on a "relation already exists" error.

## Known rough edges

Roughly in order of how much I'd worry about them:

- No password reset, no email verification, no rate limiting anywhere.
- No automated tests for the agent's Gemini prompt quality — only for the
  loop mechanics (mocked model responses).
- Export endpoints load the whole result set into memory — fine at demo
  scale, would need pagination for anything bigger.
- Filenames are sanitized against path traversal, but that's the extent of
  input hardening — no virus scanning, no content-type sniffing beyond the
  extension.
- Flower has zero auth, fine on localhost, not fine anywhere public.
- Bulk upload is capped at 20 files/request with a size limit enforced
  during the read, but there's no per-IP throttling behind it.
- PDF extraction has no OCR path, so scanned documents come back empty.

## Repo layout

```
backend/
  app/
    api/routes/       — auth, documents/jobs, agent
    services/          — document orchestration, chunking, LLM client, agent, agent tools
    workers/           — Celery app + the classical extraction task
    models/, schemas/  — SQLAlchemy models, Pydantic schemas
    db/                — session/engine setup, Redis client
  alembic/             — migrations (schema, extraction mode, chunks, users, agent history/metrics)
  tests/
    unit/               — extraction, agent loop, LLM JSON parsing
    integration/        — auth, upload, job lifecycle (real DB, real HTTP)
  requirements.txt, requirements-dev.txt
frontend/
  src/
    pages/             — login, register, dashboard, upload, job detail, ask
    components/        — dashboard rows, review form, agent trace panel, JSON viewer, etc.
    hooks/             — useJobs, useSSE / useMultiSSE, useAgentStream
    store/              — Zustand (auth, jobs + live progress)
    lib/                — API client, formatting/validation utils
.github/workflows/     — backend-ci.yml, frontend-ci.yml
docker-compose.yml       — local dev stack (postgres, redis, backend, worker, flower, frontend)
docker-compose.test.yml  — throwaway stack CI-mirrors run against
render.yaml               — Render free-tier deploy config
scripts/seed.sh          — generates + optionally uploads sample files
```

## Stack

FastAPI, SQLAlchemy (async) + Postgres/pgvector, Celery + Redis, Next.js 14,
TypeScript, Tailwind, Zustand, Gemini (extraction, embeddings, RAG, agent).
Everything containerized via Docker Compose. GitHub Actions runs backend
pytest and frontend jest/lint/type-check/build on every push, plus a Docker
build check for both.

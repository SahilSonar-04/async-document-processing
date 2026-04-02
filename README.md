# DocFlow — Async Document Processing Workflow System

A production-style full-stack application for uploading documents, processing them asynchronously via background workers, tracking progress in real time, reviewing/editing extracted output, and exporting finalized results.

> **AI tools were used** during development to assist with code generation and documentation.

---

## Architecture Overview

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  Next.js     │──────▶│  FastAPI      │──────▶│ PostgreSQL  │
│  Frontend    │  API  │  Backend      │  SQL  │ (Documents, │
│  (React/TS)  │◀──────│  + SSE        │◀──────│  Jobs,      │
│  :3000       │  SSE  │  :8000        │       │  Results)   │
└─────────────┘       └──────┬───────┘       └─────────────┘
                              │ enqueue
                              ▼
                       ┌──────────────┐       ┌─────────────┐
                       │  Celery       │◀─────▶│   Redis     │
                       │  Worker       │broker │  :6379      │
                       │              │──────▶│  Pub/Sub    │
                       └──────────────┘pub/sub └─────────────┘
```

### Services
| Service    | Role                                      | Port  |
|------------|-------------------------------------------|-------|
| `frontend` | Next.js UI — upload, dashboard, detail    | 3000  |
| `backend`  | FastAPI REST API + SSE progress streaming  | 8000  |
| `worker`   | Celery worker — 7-stage processing pipeline| —     |
| `postgres` | PostgreSQL 16 — persistent storage         | 5432  |
| `redis`    | Redis 7 — Celery broker + Pub/Sub events   | 6379  |
| `flower`   | Celery monitoring dashboard                | 5555  |

### Database Schema
- **documents** — file metadata (filename, type, size, storage path)
- **jobs** — processing state machine (queued → processing → completed/failed)
- **processing_results** — extracted structured fields + raw JSON + finalization workflow

### Processing Pipeline (7 stages)
1. `job_started` — mark as processing
2. `document_parsing_started` — begin text extraction
3. `document_parsing_completed` — text extracted
4. `field_extraction_started` — extract structured fields
5. `field_extraction_completed` — fields ready
6. `storing_result` — persist to database
7. `job_completed` / `job_failed` — terminal state

Each stage emits a Redis Pub/Sub event → consumed by FastAPI SSE → streamed to frontend.

---

## Setup Instructions

### Prerequisites
- Docker & Docker Compose

### Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd async-document-processing

# 2. Start all services
docker compose up --build

# 3. Create sample test files and upload them
chmod +x scripts/seed.sh
./scripts/seed.sh --upload
```

- **Frontend**: http://localhost:3000
- **API docs**: http://localhost:8000/docs
- **Flower** (Celery monitor): http://localhost:5555

### Environment Variables
All configured in `docker-compose.yml`. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async DB connection |
| `REDIS_URL` | `redis://redis:6379/0` | Redis for Pub/Sub |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` | Celery task broker |
| `UPLOAD_DIR` | `/app/uploads` | File storage path |

---

## API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/upload` | Upload single document |
| `POST` | `/api/v1/upload/bulk` | Upload multiple documents |
| `GET` | `/api/v1/jobs` | List jobs (search, filter, sort, paginate) |
| `GET` | `/api/v1/jobs/{id}` | Get job detail with result |
| `GET` | `/api/v1/jobs/{id}/progress` | SSE progress stream |
| `POST` | `/api/v1/jobs/{id}/retry` | Retry failed job |
| `PATCH` | `/api/v1/jobs/{id}/result` | Edit extracted fields |
| `POST` | `/api/v1/jobs/{id}/finalize` | Finalize result (lock edits) |
| `GET` | `/api/v1/export/json` | Export as JSON |
| `GET` | `/api/v1/export/csv` | Export as CSV |

---

## Frontend Features
- **Upload screen** — drag-and-drop with file validation
- **Dashboard** — job list with search, status filter, sort, pagination
- **Live progress** — SSE-powered real-time progress bars
- **Detail page** — view extracted output, edit fields, finalize
- **Export** — download finalized results as JSON or CSV

---

## Key Design Decisions

1. **Processing decoupled from HTTP** — API returns `job_id` instantly; Celery handles work asynchronously. Workers can scale independently, and crashes don't lose jobs (`acks_late` + `reject_on_worker_lost`).

2. **SSE over WebSockets** — progress is one-directional (server → client), so SSE is simpler with no connection management overhead.

3. **Redis dual role** — serves as both Celery broker (DB 1) and Pub/Sub channel for progress events (DB 0). Keeps infrastructure minimal.

4. **Idempotent retries** — `retry_count` column tracks attempts. Workers upsert results rather than insert, preventing duplicates on retry.

5. **Results stored as structured fields + raw JSON** — users can edit specific fields while the original extraction is always preserved in `raw_json`.

6. **Finalization locks edits** — once finalized, the `is_finalized` flag prevents accidental modifications. Export can filter to finalized-only records.

---

## Assumptions & Tradeoffs

### Assumptions
- File processing is simulated (keyword extraction, not real OCR/AI)
- Single-tenant — no multi-user authentication
- Files stored on local volume (Docker volume in production)

### Tradeoffs
- `time.sleep()` in worker simulates real processing latency — shows progress stages clearly
- Auto table creation on startup (via `Base.metadata.create_all`) instead of Alembic migrations for simplicity
- SSE timeout is 5 minutes — long-polling fallback not implemented

### Limitations
- No authentication/authorization
- No file content deduplication
- No cancellation (could be added via Celery `revoke`)
- No S3/cloud storage integration (local volume only)
- Large file streaming upload not implemented (files read fully into memory)

---

## Sample Files

Located in `sample_files/` after running `./scripts/seed.sh`:
- `project_overview.txt` — plain text document
- `architecture_notes.md` — markdown documentation
- `sales_data.csv` — tabular data
- `config_example.json` — structured JSON config

## Sample Exported Outputs

After processing and finalizing documents, export via:
- JSON: `GET /api/v1/export/json?finalized_only=true`
- CSV: `GET /api/v1/export/csv?finalized_only=true`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand |
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Pydantic v2 |
| Worker | Celery 5.4 |
| Database | PostgreSQL 16 |
| Broker/PubSub | Redis 7 |
| Containerization | Docker Compose |

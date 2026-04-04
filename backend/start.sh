#!/bin/bash
set -e

# Fix Database protocols for asyncpg & psycopg2 on Render
# Render provides postgres:// or postgresql:// — we need two separate URLs
if [[ "$DATABASE_URL" == postgres://* ]] || [[ "$DATABASE_URL" == postgresql://* ]]; then
    # Standardize to postgresql:// base first (handles both postgres:// and postgresql://)
    CLEAN_URL="${DATABASE_URL/postgres:\/\//postgresql:\/\/}"

    # Async URL for FastAPI (asyncpg driver)
    export DATABASE_URL="${CLEAN_URL/postgresql:\/\//postgresql+asyncpg:\/\/}"

    # Sync URL for Celery worker (psycopg2 driver)
    # ⚠ FIX: Use a SEPARATE variable so the worker never sees the asyncpg URL
    export SYNC_DATABASE_URL="${CLEAN_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"

    echo "✅ DATABASE_URL      = $DATABASE_URL"
    echo "✅ SYNC_DATABASE_URL = $SYNC_DATABASE_URL"
fi

# ── Redis URL fix for Render managed Redis ────────────────────────────────────
# Render may provide rediss:// (TLS) — keep as-is; redis:// is also fine
if [[ -n "$REDIS_URL" ]]; then
    # Celery broker/backend: use the same Redis URL
    export CELERY_BROKER_URL="${CELERY_BROKER_URL:-$REDIS_URL}"
    export CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-$REDIS_URL}"
    echo "✅ REDIS_URL          = $REDIS_URL"
fi

echo "Starting Celery worker in the background..."
# --pool=solo is correct for single-dyno free tier (avoids fork issues)
# --max-tasks-per-child=50 prevents memory leaks in long-running workers
celery -A app.workers.celery_app worker \
    --pool=solo \
    --loglevel=info \
    --max-tasks-per-child=50 &

WORKER_PID=$!
echo "✅ Celery worker started (PID=$WORKER_PID)"

echo "Starting main FastAPI server..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --timeout-keep-alive 75
#!/bin/bash
set -e

# Fix Database protocols for asyncpg & psycopg2 on Render
if [[ "$DATABASE_URL" == postgres://* ]] || [[ "$DATABASE_URL" == postgresql://* ]]; then
    # Standardize to postgresql:// first
    CLEAN_URL="${DATABASE_URL/postgres:\/\//postgresql:\/\/}"
    
    # Export specific URLs expected by our app config
    export DATABASE_URL="${CLEAN_URL/postgresql:\/\//postgresql+asyncpg:\/\/}"
    export SYNC_DATABASE_URL="${CLEAN_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"
    
    echo "✅ Database connection strings configured."
fi

echo "Starting Celery worker in the background..."
celery -A app.workers.celery_app worker --loglevel=info &

echo "Starting main FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

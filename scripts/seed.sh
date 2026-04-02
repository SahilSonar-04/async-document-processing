#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# seed.sh — create sample test files and optionally upload them
# Usage:   ./scripts/seed.sh [--upload]
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SAMPLE_DIR="$(dirname "$0")/../sample_files"
API_URL="${API_URL:-http://localhost:8000/api/v1}"

mkdir -p "$SAMPLE_DIR"

echo "📝 Creating sample files in $SAMPLE_DIR ..."

# 1. Plain text
cat > "$SAMPLE_DIR/project_overview.txt" <<'EOF'
Project Overview: Async Document Processing System

This system enables users to upload documents for background processing.
The architecture uses FastAPI for the API layer, Celery for async task
execution, Redis for message brokering and Pub/Sub progress events,
and PostgreSQL for persistent storage.

Key features include multi-stage processing pipelines, live progress
tracking via SSE, result review and editing, finalization workflow,
and export to JSON/CSV formats.
EOF

# 2. Markdown
cat > "$SAMPLE_DIR/architecture_notes.md" <<'EOF'
# Architecture Notes

## Components
- **Frontend**: Next.js with TypeScript, Zustand for state
- **Backend**: FastAPI with async SQLAlchemy
- **Worker**: Celery with Redis broker
- **Database**: PostgreSQL 16
- **Cache/PubSub**: Redis 7

## Data Flow
1. User uploads file → API validates and stores on disk
2. API creates Document + Job records in PostgreSQL
3. Celery task is enqueued via Redis broker
4. Worker picks up task, processes in 7 stages
5. Each stage publishes progress to Redis Pub/Sub
6. FastAPI SSE endpoint subscribes and streams to frontend
7. Result stored in DB, user reviews and finalizes
EOF

# 3. CSV
cat > "$SAMPLE_DIR/sales_data.csv" <<'EOF'
date,product,category,amount,region
2024-01-15,Widget A,Electronics,1299.99,North
2024-01-16,Widget B,Electronics,899.50,South
2024-01-17,Gadget X,Accessories,149.99,East
2024-01-18,Gadget Y,Accessories,249.99,West
2024-01-19,Service Plan,Services,499.00,North
2024-01-20,Widget C,Electronics,1599.00,South
EOF

# 4. JSON
cat > "$SAMPLE_DIR/config_example.json" <<'EOF'
{
  "application": "DocFlow",
  "version": "1.0.0",
  "features": {
    "upload": true,
    "async_processing": true,
    "sse_progress": true,
    "export": ["json", "csv"],
    "retry": true,
    "finalization": true
  },
  "limits": {
    "max_file_size_mb": 50,
    "allowed_types": ["pdf", "txt", "csv", "json", "md", "docx"],
    "max_concurrent_workers": 4
  }
}
EOF

echo "✅ Sample files created:"
ls -la "$SAMPLE_DIR"

# ── Optional: upload via API ──────────────────────────────────
if [[ "${1:-}" == "--upload" ]]; then
  echo ""
  echo "🚀 Uploading sample files to $API_URL ..."
  for f in "$SAMPLE_DIR"/*; do
    fname=$(basename "$f")
    echo "  ↑ $fname"
    curl -s -X POST "$API_URL/upload" \
      -F "file=@$f" \
      -H "Accept: application/json" | python3 -m json.tool 2>/dev/null || echo "  ⚠ Upload failed for $fname"
    echo ""
  done
  echo "✅ Done! Check the dashboard at http://localhost:3000"
fi

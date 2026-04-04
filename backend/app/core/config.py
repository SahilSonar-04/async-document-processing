from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "DocFlow"
    environment: str = "development"
    secret_key: str = "supersecretkey_change_in_production"

    # Database
    database_url: str = "postgresql+asyncpg://docflow:docflow_secret@postgres:5432/docflow_db"
    sync_database_url: str = "postgresql+psycopg2://docflow:docflow_secret@postgres:5432/docflow_db"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # File storage
    upload_dir: str = "/app/uploads"
    max_file_size_mb: int = 50
    allowed_extensions: list[str] = ["pdf", "txt", "csv", "json", "md", "docx"]

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://async-document-processing.vercel.app",
    ]

    # Celery
    celery_task_max_retries: int = 3
    celery_task_retry_backoff: int = 60  # seconds

    # Pub/Sub channel prefix
    pubsub_channel_prefix: str = "job_events"

    # SSE delivery mode:
    #   "pubsub" — Redis Pub/Sub (fast, requires Upstash or self-hosted Redis)
    #   "poll"   — DB polling fallback (works on Render free Redis)
    sse_mode: str = "pubsub"

    # How often (seconds) the SSE poll loop queries the DB
    sse_poll_interval: float = 1.5

    # Max SSE stream duration in seconds.
    # Render free tier hard-kills requests at 90s — keep this under that.
    sse_timeout: int = 75

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
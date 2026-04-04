from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "docflow",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,             # Ack only after successful processing
    worker_prefetch_multiplier=1,    # One task at a time per worker process
    task_reject_on_worker_lost=True,
    task_default_retry_delay=60,
    # ✅ FIX: Removed task_max_retries from here — it conflicts with the
    # max_retries=3 set on the @celery_app.task decorator in tasks.py.
    # The decorator value takes precedence, but having both causes a warning
    # and can cause unexpected behaviour on some Celery versions.
    result_expires=86400,            # 24 hours
    worker_send_task_events=True,
    task_send_sent_event=True,
    # ✅ Retry broker connection on startup (important on Render where Redis
    # may not be ready the instant the dyno boots)
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
)
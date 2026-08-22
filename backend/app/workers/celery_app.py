"""Celery distributed task queue configuration and initialization.

This module sets up the Celery application instance with:
- Redis message broker and result backend.
- Late task acknowledgements (`task_acks_late=True`) to guarantee at-least-once delivery.
- Fair worker scheduling (`worker_prefetch_multiplier=1`) to prevent queue monopolization.
- Automatic connection retries and result expiration policies.
"""

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
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    task_default_retry_delay=60,
    result_expires=86400,
    worker_send_task_events=True,
    task_send_sent_event=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=10,
)
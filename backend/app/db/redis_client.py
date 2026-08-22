"""Redis connection management, pub/sub event broadcasting, and status caching.

This module provides both asynchronous (FastAPI event streaming) and synchronous
(Celery background task) Redis clients, standardized pub/sub channel naming,
and short-term caching of document processing progress snapshots.
"""

import json
import logging
from typing import Any
import redis.asyncio as aioredis
import redis as sync_redis

from app.core.config import settings

logger = logging.getLogger(__name__)

async_redis_pool = aioredis.ConnectionPool.from_url(
    settings.redis_url, max_connections=20, decode_responses=True
)


async def get_async_redis() -> aioredis.Redis:
    """Acquire an asynchronous Redis client from the shared connection pool.

    Returns:
        aioredis.Redis: Async Redis client with auto-decoded string responses.
    """
    return aioredis.Redis(connection_pool=async_redis_pool)


def get_sync_redis() -> sync_redis.Redis:
    """Create a synchronous Redis client for background worker processes.

    Returns:
        sync_redis.Redis: Synchronous Redis client with auto-decoded string responses.
    """
    return sync_redis.from_url(settings.redis_url, decode_responses=True)


def get_pubsub_channel(job_id: str) -> str:
    """Construct the standardized Redis Pub/Sub channel name for a given job.

    Args:
        job_id: Unique string identifier of the document processing job.

    Returns:
        str: Channel name formatted as `<prefix>:<job_id>`.
    """
    return f"{settings.pubsub_channel_prefix}:{job_id}"


def publish_event_sync(job_id: str, event: dict[str, Any]) -> None:
    """Publish a progress event to Redis Pub/Sub and update the cached status key.

    Executed from synchronous worker tasks to broadcast progress to active SSE
    listeners and store the latest status snapshot (1-hour TTL) for late subscribers.

    Args:
        job_id: Unique string identifier of the target job.
        event: Dictionary containing event details (stage, progress, timestamp, message).
    """
    client = get_sync_redis()
    try:
        channel = get_pubsub_channel(job_id)
        try:
            client.publish(channel, json.dumps(event))
        except Exception as e:
            logger.debug("Pub/Sub publish skipped (%s): %s", type(e).__name__, e)

        cache_key = f"job_status:{job_id}"
        client.setex(cache_key, 3600, json.dumps(event))
    finally:
        client.close()


async def get_cached_job_status(redis_client: aioredis.Redis, job_id: str) -> dict[str, Any] | None:
    """Retrieve the latest cached job status snapshot from Redis.

    Args:
        redis_client: Active asynchronous Redis client.
        job_id: Unique string identifier of the job.

    Returns:
        dict[str, Any] | None: Deserialized status payload, or None if key is absent or corrupted.
    """
    key = f"job_status:{job_id}"
    try:
        raw = await redis_client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None
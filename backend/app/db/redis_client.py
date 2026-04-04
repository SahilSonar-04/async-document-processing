import json
import logging
import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

logger = logging.getLogger(__name__)

# Async client for FastAPI SSE endpoint
async_redis_pool = aioredis.ConnectionPool.from_url(
    settings.redis_url, max_connections=20, decode_responses=True
)


async def get_async_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=async_redis_pool)


# Sync client for Celery workers (Celery runs in sync context)
def get_sync_redis() -> sync_redis.Redis:
    return sync_redis.from_url(settings.redis_url, decode_responses=True)


def get_pubsub_channel(job_id: str) -> str:
    return f"{settings.pubsub_channel_prefix}:{job_id}"


async def publish_event(redis_client: aioredis.Redis, job_id: str, event: dict) -> None:
    channel = get_pubsub_channel(job_id)
    try:
        await redis_client.publish(channel, json.dumps(event))
    except Exception as e:
        # Render free Redis disables Pub/Sub — log and continue gracefully.
        # The SSE endpoint falls back to DB polling when sse_mode="poll".
        logger.debug("Pub/Sub publish skipped (%s): %s", type(e).__name__, e)


def publish_event_sync(job_id: str, event: dict) -> None:
    """
    Called from Celery workers (sync context).

    Always caches the latest event in Redis regardless of whether Pub/Sub
    works, so the DB-poll SSE fallback and the frontend can both read it.
    """
    client = get_sync_redis()
    try:
        channel = get_pubsub_channel(job_id)
        try:
            client.publish(channel, json.dumps(event))
        except Exception as e:
            # Pub/Sub blocked on Render free Redis — not fatal
            logger.debug("Pub/Sub publish skipped (%s): %s", type(e).__name__, e)

        # ── Always cache latest status (used by poll-mode SSE + frontend) ──
        cache_key = f"job_status:{job_id}"
        client.setex(cache_key, 3600, json.dumps(event))

    finally:
        client.close()


async def cache_job_status(redis_client: aioredis.Redis, job_id: str, data: dict) -> None:
    """Cache latest job state for fast polling fallback."""
    key = f"job_status:{job_id}"
    try:
        await redis_client.setex(key, 3600, json.dumps(data))
    except Exception as e:
        logger.warning("Failed to cache job status: %s", e)


async def get_cached_job_status(redis_client: aioredis.Redis, job_id: str) -> dict | None:
    key = f"job_status:{job_id}"
    try:
        raw = await redis_client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None
import json
import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

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
    await redis_client.publish(channel, json.dumps(event))


def publish_event_sync(job_id: str, event: dict) -> None:
    """Called from Celery workers (sync context)."""
    client = get_sync_redis()
    channel = get_pubsub_channel(job_id)
    client.publish(channel, json.dumps(event))
    client.close()


async def cache_job_status(redis_client: aioredis.Redis, job_id: str, data: dict) -> None:
    """Cache latest job state for fast polling fallback."""
    key = f"job_status:{job_id}"
    await redis_client.setex(key, 3600, json.dumps(data))


async def get_cached_job_status(redis_client: aioredis.Redis, job_id: str) -> dict | None:
    key = f"job_status:{job_id}"
    raw = await redis_client.get(key)
    return json.loads(raw) if raw else None

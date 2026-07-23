import json
import logging
import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

logger = logging.getLogger(__name__)

async_redis_pool = aioredis.ConnectionPool.from_url(
    settings.redis_url, max_connections=20, decode_responses=True
)


async def get_async_redis() -> aioredis.Redis:
    return aioredis.Redis(connection_pool=async_redis_pool)


def get_sync_redis() -> sync_redis.Redis:
    return sync_redis.from_url(settings.redis_url, decode_responses=True)


def get_pubsub_channel(job_id: str) -> str:
    return f"{settings.pubsub_channel_prefix}:{job_id}"


def publish_event_sync(job_id: str, event: dict) -> None:
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


async def get_cached_job_status(redis_client: aioredis.Redis, job_id: str) -> dict | None:
    key = f"job_status:{job_id}"
    try:
        raw = await redis_client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None
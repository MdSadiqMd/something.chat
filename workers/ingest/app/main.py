import asyncio
import logging
import signal

import redis.asyncio as aioredis

from .config import settings
from .db import close_pool, init_pool
from .processor import handle_message

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("ingest-worker")


async def ensure_consumer_group(redis: aioredis.Redis) -> None:
    try:
        await redis.xgroup_create(
            settings.redis_stream_name,
            settings.redis_consumer_group,
            id="0",
            mkstream=True,
        )
        logger.info("Created consumer group %s", settings.redis_consumer_group)
    except Exception as exc:
        # BUSYGROUP means group already exists — that's fine
        if "BUSYGROUP" not in str(exc):
            raise


async def process_pending(redis: aioredis.Redis) -> None:
    """Claim and retry any messages that timed out from previous runs."""
    pending = await redis.xautoclaim(
        settings.redis_stream_name,
        settings.redis_consumer_group,
        settings.redis_consumer_name,
        min_idle_time=60_000,
        start_id="0-0",
        count=settings.redis_batch_size,
    )
    messages = pending[1] if pending else []
    for msg_id, fields in messages:
        await _dispatch(redis, msg_id, fields)


async def _dispatch(redis: aioredis.Redis, msg_id: str, fields: dict) -> None:
    raw = fields.get("data", "{}")
    retries = int(fields.get("_retries", 0))

    try:
        await handle_message(raw)
        await redis.xack(
            settings.redis_stream_name, settings.redis_consumer_group, msg_id
        )
        logger.debug("ACKed %s", msg_id)
    except Exception:
        logger.exception("Error processing %s (retry %d)", msg_id, retries)
        if retries >= settings.redis_max_retries:
            # Move to DLQ
            await redis.xadd(
                settings.redis_dlq_name,
                {"data": raw, "failed_id": msg_id, "_retries": retries},
            )
            await redis.xack(
                settings.redis_stream_name, settings.redis_consumer_group, msg_id
            )
            logger.error("Moved %s to DLQ after %d retries", msg_id, retries)


async def consume(redis: aioredis.Redis, stop_event: asyncio.Event) -> None:
    await ensure_consumer_group(redis)
    await process_pending(redis)

    logger.info("Worker ready — consuming %s", settings.redis_stream_name)

    while not stop_event.is_set():
        try:
            results = await redis.xreadgroup(
                settings.redis_consumer_group,
                settings.redis_consumer_name,
                {settings.redis_stream_name: ">"},
                count=settings.redis_batch_size,
                block=settings.redis_block_ms,
            )
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("xreadgroup failed, retrying in 2s")
            await asyncio.sleep(2)
            continue

        if not results:
            continue

        for _stream, messages in results:
            for msg_id, fields in messages:
                await _dispatch(redis, msg_id, fields)


async def main() -> None:
    await init_pool()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)

    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    try:
        await consume(redis, stop_event)
    finally:
        await redis.aclose()
        await close_pool()
        logger.info("Worker stopped cleanly")


if __name__ == "__main__":
    asyncio.run(main())

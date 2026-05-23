import asyncpg

from .config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)


async def close_pool() -> None:
    if _pool:
        await _pool.close()


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised")
    return _pool


async def upsert_inference_log(data: dict) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO inference_logs (
                request_id, conversation_id, message_id, provider, model,
                status, error_code, error_message,
                started_at, finished_at, latency_ms, ttft_ms,
                prompt_tokens, completion_tokens, total_tokens,
                input_preview, output_preview, redaction_summary,
                sdk_version, raw_envelope
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9::timestamptz, $10::timestamptz, $11, $12,
                $13, $14, $15,
                $16, $17, $18::jsonb,
                $19, $20::jsonb
            )
            ON CONFLICT (request_id, started_at) DO UPDATE SET
                status          = EXCLUDED.status,
                finished_at     = EXCLUDED.finished_at,
                latency_ms      = EXCLUDED.latency_ms,
                ttft_ms         = EXCLUDED.ttft_ms,
                completion_tokens = EXCLUDED.completion_tokens,
                total_tokens    = EXCLUDED.total_tokens,
                output_preview  = EXCLUDED.output_preview,
                redaction_summary = EXCLUDED.redaction_summary
            """,
            data["request_id"],
            data.get("conversation_id"),
            data.get("message_id"),
            data["provider"],
            data["model"],
            data["status"],
            data.get("error_code"),
            data.get("error_message"),
            data["started_at"],
            data.get("finished_at"),
            data.get("latency_ms"),
            data.get("ttft_ms"),
            data.get("prompt_tokens"),
            data.get("completion_tokens"),
            data.get("total_tokens"),
            data.get("input_preview"),
            data.get("output_preview"),
            data.get("redaction_summary"),
            data.get("sdk_version"),
            data,
        )

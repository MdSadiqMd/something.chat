from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from ..db import acquire
from ..models import ErrorRatePoint, LatencyStats, MetricBucket, ThroughputPoint

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])

_1H_AGO = lambda: datetime.now(timezone.utc) - timedelta(hours=1)  # noqa: E731
_24H_AGO = lambda: datetime.now(timezone.utc) - timedelta(hours=24)  # noqa: E731


@router.get("/latency", response_model=list[LatencyStats])
async def latency_stats(
    since: datetime = Query(default_factory=_24H_AGO),
    provider: str | None = Query(default=None),
) -> list[LatencyStats]:
    async with acquire() as conn:
        args: list = [since]
        where = "WHERE started_at >= $1 AND latency_ms IS NOT NULL"
        if provider:
            args.append(provider)
            where += f" AND provider = ${len(args)}"

        rows = await conn.fetch(
            f"""
            SELECT
                provider,
                model,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
                COUNT(*) AS total_requests
            FROM inference_logs
            {where}
            GROUP BY provider, model
            ORDER BY total_requests DESC
            """,
            *args,
        )
    return [LatencyStats(**dict(r)) for r in rows]


@router.get("/throughput", response_model=list[ThroughputPoint])
async def throughput(
    since: datetime = Query(default_factory=_1H_AGO),
    bucket_minutes: int = Query(default=1, ge=1, le=60),
) -> list[ThroughputPoint]:
    async with acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                time_bucket($1::interval, started_at) AS bucket,
                provider,
                COUNT(*) AS requests_per_minute
            FROM inference_logs
            WHERE started_at >= $2
            GROUP BY bucket, provider
            ORDER BY bucket ASC
            """,
            f"{bucket_minutes} minutes",
            since,
        )
    return [ThroughputPoint(**dict(r)) for r in rows]


@router.get("/errors", response_model=list[ErrorRatePoint])
async def error_rates(
    since: datetime = Query(default_factory=_1H_AGO),
    bucket_minutes: int = Query(default=5, ge=1, le=60),
) -> list[ErrorRatePoint]:
    async with acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                time_bucket($1::interval, started_at) AS bucket,
                COUNT(*) AS total,
                SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors,
                ROUND(
                    SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100,
                    2
                ) AS error_rate
            FROM inference_logs
            WHERE started_at >= $2
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            f"{bucket_minutes} minutes",
            since,
        )
    return [ErrorRatePoint(**dict(r)) for r in rows]


@router.get("/overview", response_model=list[MetricBucket])
async def overview(
    since: datetime = Query(default_factory=_1H_AGO),
    bucket_minutes: int = Query(default=5, ge=1, le=60),
) -> list[MetricBucket]:
    async with acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                time_bucket($1::interval, started_at) AS bucket,
                provider,
                model,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
                AVG(latency_ms) AS avg_ms,
                COUNT(*) AS request_count,
                SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS error_count,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                AVG(ttft_ms) AS avg_ttft_ms
            FROM inference_logs
            WHERE started_at >= $2
            GROUP BY bucket, provider, model
            ORDER BY bucket ASC
            """,
            f"{bucket_minutes} minutes",
            since,
        )
    return [MetricBucket(**dict(r)) for r in rows]

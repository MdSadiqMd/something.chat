import json

from fastapi import APIRouter, HTTPException, status

from ..config import settings
from ..models import InferenceLogIn
from ..redis_client import get_redis

router = APIRouter(prefix="/v1/logs", tags=["logs"])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_log(payload: InferenceLogIn) -> dict[str, str]:
    """Validate the log envelope and publish it to the Redis stream."""
    redis = get_redis()

    try:
        await redis.xadd(
            settings.redis_stream_name,
            {"data": json.dumps(payload.model_dump())},
            maxlen=settings.redis_max_stream_len,
            approximate=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to publish to stream",
        ) from exc

    return {"requestId": payload.requestId, "status": "accepted"}

"""SSE streaming chat endpoint.

Accepts a chat request, streams tokens from the configured provider, persists
the assistant message + an inference log to the same backing store the SDK
would have logged to.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Literal
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import settings
from ..db import acquire
from ..llm import build_provider, get_configured_providers, redact_preview
from ..redis_client import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/chat", tags=["chat"])


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    conversationId: str
    provider: str
    model: str
    messages: list[ChatMessageIn]


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _stream_chat(req: ChatRequest) -> AsyncIterator[str]:
    request_id = str(uuid.uuid4())
    started_at_iso = datetime.now(timezone.utc).isoformat()
    started_at_ms = time.time() * 1000

    chunks: list[str] = []
    ttft_ms: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    status: str = "ok"
    error_message: str | None = None
    message_id: str | None = None

    try:
        adapter = build_provider(req.provider)
        msgs = [{"role": m.role, "content": m.content} for m in req.messages]

        async for event in adapter.stream(req.model, msgs):
            if event.kind == "delta":
                if ttft_ms is None:
                    ttft_ms = int(time.time() * 1000 - started_at_ms)
                chunks.append(event.text)
                yield _sse({"type": "delta", "text": event.text})
            elif event.kind == "usage":
                if event.prompt_tokens > 0:
                    prompt_tokens = event.prompt_tokens
                completion_tokens = event.completion_tokens
                total_tokens = event.total_tokens

        full_text = "".join(chunks)

        # Persist assistant message
        try:
            async with acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO messages (conversation_id, role, content, inference_log_id)
                    VALUES ($1, 'assistant', $2, $3)
                    RETURNING id
                    """,
                    UUID(req.conversationId),
                    full_text,
                    request_id,
                )
                if row:
                    message_id = str(row["id"])
                await conn.execute(
                    "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
                    UUID(req.conversationId),
                )
        except Exception as exc:
            logger.warning("Failed to persist assistant message: %s", exc)

        yield _sse({"type": "done", "messageId": message_id, "fullText": full_text})

    except Exception as exc:
        status = "error"
        error_message = str(exc)
        logger.exception("Chat stream failed for request %s", request_id)
        yield _sse({"type": "error", "error": error_message})

    finally:
        # Fire inference log to Redis stream (same path the TS SDK uses)
        try:
            input_text = "\n".join(m.content for m in req.messages)
            input_preview, in_summary = redact_preview(input_text)
            output_preview, out_summary = redact_preview("".join(chunks))
            redaction_summary = {**in_summary}
            for k, v in out_summary.items():
                redaction_summary[k] = redaction_summary.get(k, 0) + v

            log = {
                "requestId": request_id,
                "conversationId": req.conversationId,
                "messageId": message_id,
                "provider": req.provider,
                "model": req.model,
                "status": status,
                "errorMessage": error_message,
                "startedAt": started_at_iso,
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "latencyMs": int(time.time() * 1000 - started_at_ms),
                "ttftMs": ttft_ms,
                "promptTokens": prompt_tokens,
                "completionTokens": completion_tokens,
                "totalTokens": total_tokens,
                "inputPreview": input_preview,
                "outputPreview": output_preview,
                "redactionSummary": redaction_summary or None,
                "sdkVersion": "py-fastapi-0.1.0",
            }
            redis = get_redis()
            await redis.xadd(
                settings.redis_stream_name,
                {"data": json.dumps(log)},
                maxlen=settings.redis_max_stream_len,
                approximate=True,
            )
        except Exception as exc:
            logger.warning("Failed to emit inference log: %s", exc)


@router.post("/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_chat(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/providers")
async def list_providers() -> dict:
    return {"providers": get_configured_providers()}

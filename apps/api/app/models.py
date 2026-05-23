from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class InferenceLogIn(BaseModel):
    requestId: str
    conversationId: str
    messageId: str | None = None
    provider: str
    model: str
    status: Literal["ok", "error", "cancelled"]
    errorCode: str | None = None
    errorMessage: str | None = None
    startedAt: str
    finishedAt: str | None = None
    latencyMs: int | None = None
    ttftMs: int | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None
    inputPreview: str | None = None
    outputPreview: str | None = None
    redactionSummary: dict[str, int] | None = None
    sdkVersion: str


class ConversationCreate(BaseModel):
    title: str = "New Conversation"
    model_default: str = "gpt-4o-mini"
    provider_default: str = "openai"


class ConversationUpdate(BaseModel):
    title: str | None = None
    model_default: str | None = None
    provider_default: str | None = None
    status: Literal["active", "archived", "cancelled"] | None = None


class ConversationOut(BaseModel):
    id: UUID
    title: str
    model_default: str
    provider_default: str
    status: str
    created_at: datetime
    updated_at: datetime


class MessageCreate(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    inference_log_id: str | None = None


class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    inference_log_id: str | None
    created_at: datetime


class MetricBucket(BaseModel):
    bucket: datetime
    provider: str
    model: str
    p50_ms: float | None = None
    p95_ms: float | None = None
    p99_ms: float | None = None
    avg_ms: float | None = None
    request_count: int = 0
    error_count: int = 0
    total_tokens: int = 0
    avg_ttft_ms: float | None = None


class LatencyStats(BaseModel):
    provider: str
    model: str
    p50_ms: float | None = None
    p95_ms: float | None = None
    p99_ms: float | None = None
    total_requests: int = 0


class ThroughputPoint(BaseModel):
    bucket: datetime
    requests_per_minute: float
    provider: str | None = None


class ErrorRatePoint(BaseModel):
    bucket: datetime
    total: int
    errors: int
    error_rate: float
    provider: str | None = None


class HealthOut(BaseModel):
    status: str = "ok"
    db: str = "ok"
    redis: str = "ok"


class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)

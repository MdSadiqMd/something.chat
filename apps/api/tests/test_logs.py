import json
from unittest.mock import AsyncMock

import pytest

LOG_PAYLOAD = {
    "requestId": "req-abc-123",
    "conversationId": "conv-def-456",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "status": "ok",
    "startedAt": "2026-05-23T10:00:00Z",
    "finishedAt": "2026-05-23T10:00:01Z",
    "latencyMs": 1000,
    "ttftMs": 200,
    "promptTokens": 50,
    "completionTokens": 30,
    "totalTokens": 80,
    "sdkVersion": "0.1.0",
}


def test_ingest_log_accepted(client, mock_redis):
    mock_redis.xadd = AsyncMock(return_value="1234-0")
    response = client.post("/v1/logs", json=LOG_PAYLOAD)
    assert response.status_code == 202
    assert response.json()["requestId"] == "req-abc-123"
    assert response.json()["status"] == "accepted"


def test_ingest_log_missing_required_field(client):
    bad = {k: v for k, v in LOG_PAYLOAD.items() if k != "sdkVersion"}
    response = client.post("/v1/logs", json=bad)
    assert response.status_code == 422


def test_ingest_log_invalid_status(client):
    payload = {**LOG_PAYLOAD, "status": "unknown"}
    response = client.post("/v1/logs", json=payload)
    assert response.status_code == 422


def test_ingest_log_redis_failure_returns_503(client, mock_redis):
    mock_redis.xadd = AsyncMock(side_effect=Exception("Redis down"))
    response = client.post("/v1/logs", json=LOG_PAYLOAD)
    assert response.status_code == 503


@pytest.mark.parametrize("status", ["ok", "error", "cancelled"])
def test_ingest_log_all_statuses(client, mock_redis, status):
    mock_redis.xadd = AsyncMock(return_value="1234-0")
    payload = {**LOG_PAYLOAD, "status": status}
    response = client.post("/v1/logs", json=payload)
    assert response.status_code == 202

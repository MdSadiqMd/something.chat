import json

import pytest
from app.processor import process_message


BASE_LOG = {
    "requestId": "req-1",
    "conversationId": "conv-1",
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "status": "ok",
    "startedAt": "2026-05-23T10:00:00Z",
    "finishedAt": "2026-05-23T10:00:01Z",
    "latencyMs": 1000,
    "promptTokens": 50,
    "completionTokens": 30,
    "totalTokens": 80,
    "sdkVersion": "0.1.0",
}


def test_process_normalises_keys():
    result = process_message(json.dumps(BASE_LOG))
    assert result["request_id"] == "req-1"
    assert result["conversation_id"] == "conv-1"
    assert result["provider"] == "openai"
    assert result["model"] == "gpt-5.4-mini"
    assert result["status"] == "ok"
    assert result["latency_ms"] == 1000


def test_process_estimates_cost():
    result = process_message(json.dumps(BASE_LOG))
    assert result["cost_usd"] is not None
    assert result["cost_usd"] > 0


def test_process_unknown_model_no_cost():
    log = {**BASE_LOG, "model": "unknown-model-xyz"}
    result = process_message(json.dumps(log))
    assert result["cost_usd"] is None


def test_process_redacts_preview_pii():
    log = {**BASE_LOG, "inputPreview": "Hi, my SSN is 123-45-6789"}
    result = process_message(json.dumps(log))
    assert "[SSN]" in result["input_preview"]
    assert "123-45-6789" not in result["input_preview"]


def test_process_detects_discrepancy():
    log = {
        **BASE_LOG,
        "inputPreview": "Email: test@example.com",
        "redactionSummary": {},  # SDK missed it
    }
    result = process_message(json.dumps(log))
    assert result["redaction_summary"] is not None
    assert result["redaction_summary"].get("_discrepancy") == 1


def test_process_cancelled_status():
    log = {**BASE_LOG, "status": "cancelled", "errorCode": "CANCELLED"}
    result = process_message(json.dumps(log))
    assert result["status"] == "cancelled"
    assert result["error_code"] == "CANCELLED"


def test_process_missing_optional_fields():
    minimal = {
        "requestId": "req-min",
        "provider": "anthropic",
        "model": "claude-3-haiku-20240307",
        "status": "ok",
        "startedAt": "2026-05-23T10:00:00Z",
        "sdkVersion": "0.1.0",
    }
    result = process_message(json.dumps(minimal))
    assert result["request_id"] == "req-min"
    assert result["conversation_id"] is None
    assert result["latency_ms"] is None

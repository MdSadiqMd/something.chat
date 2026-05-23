"""Functional tests for /v1/chat/stream and /v1/chat/providers.

We mock build_provider so no real LLM API key is needed.
"""

import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch


class _FakeEvent:
    def __init__(
        self, kind, text="", prompt_tokens=0, completion_tokens=0, total_tokens=0
    ):
        self.kind = kind
        self.text = text
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens


class _FakeAdapter:
    def __init__(self, deltas, usage=None, error=None):
        self._deltas = deltas
        self._usage = usage
        self._error = error

    async def stream(self, model, messages):
        if self._error:
            raise self._error
        for text in self._deltas:
            yield _FakeEvent(kind="delta", text=text)
        if self._usage:
            yield _FakeEvent(kind="usage", **self._usage)


def _patch_acquire(fetchrow=None):
    """Patch app.routers.chat.acquire to return a mock connection."""
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=fetchrow)
    conn.execute = AsyncMock(return_value="UPDATE 1")

    @asynccontextmanager
    async def _acquire():
        yield conn

    return patch("app.routers.chat.acquire", _acquire)


def test_providers_endpoint_returns_configured_keys(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "AIza-test")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    resp = client.get("/v1/chat/providers")
    assert resp.status_code == 200
    body = resp.json()
    assert "openai" in body["providers"]
    assert "google" in body["providers"]
    assert "anthropic" not in body["providers"]


def test_chat_stream_emits_deltas_and_done(client, mock_redis):
    adapter = _FakeAdapter(
        deltas=["Hello", " world", "!"],
        usage={"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    )

    with (
        patch("app.routers.chat.build_provider", return_value=adapter),
        _patch_acquire(fetchrow={"id": "11111111-1111-1111-1111-111111111111"}),
    ):
        resp = client.post(
            "/v1/chat/stream",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "Hi"}],
            },
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    # Parse SSE events from the body
    events = _parse_sse(resp.text)
    delta_texts = [e["text"] for e in events if e["type"] == "delta"]
    assert delta_texts == ["Hello", " world", "!"]

    done = next(e for e in events if e["type"] == "done")
    assert done["fullText"] == "Hello world!"
    assert done["messageId"] is not None


def test_chat_stream_emits_error_on_provider_failure(client, mock_redis):
    adapter = _FakeAdapter(deltas=[], error=RuntimeError("Rate limit exceeded"))

    with (
        patch("app.routers.chat.build_provider", return_value=adapter),
        _patch_acquire(fetchrow=None),
    ):
        resp = client.post(
            "/v1/chat/stream",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000002",
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "x"}],
            },
        )

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    err = next(e for e in events if e["type"] == "error")
    assert "Rate limit exceeded" in err["error"]


def test_chat_stream_unknown_provider_returns_error_event(client, mock_redis):
    # build_provider will raise because no env var is set
    with (
        patch(
            "app.routers.chat.build_provider",
            side_effect=ValueError("Provider 'xx' is not configured"),
        ),
        _patch_acquire(fetchrow=None),
    ):
        resp = client.post(
            "/v1/chat/stream",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000003",
                "provider": "xx",
                "model": "no-model",
                "messages": [{"role": "user", "content": "x"}],
            },
        )

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert any(e["type"] == "error" for e in events)


def test_chat_stream_logs_to_redis(client, mock_redis):
    adapter = _FakeAdapter(
        deltas=["hi"],
        usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    )

    with (
        patch("app.routers.chat.build_provider", return_value=adapter),
        _patch_acquire(fetchrow={"id": "22222222-2222-2222-2222-222222222222"}),
    ):
        resp = client.post(
            "/v1/chat/stream",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000004",
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )

    assert resp.status_code == 200
    # Verify xadd was called (log emitted)
    mock_redis.xadd.assert_called()
    call_args = mock_redis.xadd.call_args
    payload = json.loads(call_args[0][1]["data"])
    assert payload["status"] == "ok"
    assert payload["provider"] == "openai"
    assert payload["model"] == "gpt-4o-mini"
    assert payload["totalTokens"] == 2


def test_chat_stream_redacts_pii_in_preview(client, mock_redis):
    adapter = _FakeAdapter(deltas=["ok"])

    with (
        patch("app.routers.chat.build_provider", return_value=adapter),
        _patch_acquire(fetchrow=None),
    ):
        resp = client.post(
            "/v1/chat/stream",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000005",
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "user", "content": "Email me at alice@example.com"}
                ],
            },
        )

    assert resp.status_code == 200
    call_args = mock_redis.xadd.call_args
    payload = json.loads(call_args[0][1]["data"])
    assert "[EMAIL]" in payload["inputPreview"]
    assert "alice@example.com" not in payload["inputPreview"]


def test_chat_stream_validates_body(client):
    resp = client.post(
        "/v1/chat/stream", json={"provider": "openai"}
    )  # missing required fields
    assert resp.status_code == 422


def _parse_sse(text: str) -> list[dict]:
    """Parse `data: {...}\\n\\n` lines from an SSE response body."""
    events = []
    for line in text.split("\n"):
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events

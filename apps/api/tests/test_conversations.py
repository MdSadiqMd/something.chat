import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

CONV_ROW = {
    "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
    "title": "Test Chat",
    "model_default": "gpt-4o-mini",
    "provider_default": "openai",
    "status": "active",
    "created_at": datetime(2026, 5, 23, tzinfo=timezone.utc),
    "updated_at": datetime(2026, 5, 23, tzinfo=timezone.utc),
}


def make_conn(fetchrow=None, fetch=None, fetchval=None, execute=None):
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=fetchrow)
    conn.fetch = AsyncMock(return_value=fetch or [])
    conn.fetchval = AsyncMock(return_value=fetchval)
    conn.execute = AsyncMock(return_value=execute or "UPDATE 1")
    return conn


def patch_acquire(conn):
    @asynccontextmanager
    async def _acquire():
        yield conn

    return patch("app.routers.conversations.acquire", _acquire)


def test_list_conversations_empty(client, mock_pool):
    conn = make_conn(fetch=[])
    with patch_acquire(conn):
        resp = client.get("/v1/conversations")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_conversations(client, mock_pool):
    conn = make_conn(fetch=[CONV_ROW])
    with patch_acquire(conn):
        resp = client.get("/v1/conversations")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Test Chat"


def test_create_conversation(client, mock_pool):
    conn = make_conn(fetchrow=CONV_ROW)
    with patch_acquire(conn):
        resp = client.post("/v1/conversations", json={"title": "Test Chat"})
    assert resp.status_code == 201
    assert resp.json()["title"] == "Test Chat"


def test_get_conversation_not_found(client, mock_pool):
    conv_id = uuid.uuid4()
    conn = make_conn(fetchrow=None)
    with patch_acquire(conn):
        resp = client.get(f"/v1/conversations/{conv_id}")
    assert resp.status_code == 404


def test_cancel_conversation(client, mock_pool):
    conv_id = uuid.uuid4()
    conn = make_conn(execute="UPDATE 1")
    with patch_acquire(conn):
        resp = client.delete(f"/v1/conversations/{conv_id}")
    assert resp.status_code == 204


def test_cancel_conversation_not_found(client, mock_pool):
    conv_id = uuid.uuid4()
    conn = make_conn(execute="UPDATE 0")
    with patch_acquire(conn):
        resp = client.delete(f"/v1/conversations/{conv_id}")
    assert resp.status_code == 404

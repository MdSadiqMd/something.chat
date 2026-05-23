from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_redis(monkeypatch):
    """Patch redis client with an async mock."""
    mock = AsyncMock()
    mock.xadd = AsyncMock(return_value="1234-0")
    import app.redis_client as rc

    monkeypatch.setattr(rc, "_client", mock)
    return mock


@pytest.fixture
def mock_pool(monkeypatch):
    """Patch asyncpg pool with a mock that returns configurable rows."""
    pool = MagicMock()
    import app.db as db

    monkeypatch.setattr(db, "_pool", pool)
    return pool


@pytest.fixture
def client(mock_redis, mock_pool):
    from app.main import app

    return TestClient(app)

"""Fail-fast Redis retry policy (independent of the redis-py default)."""

import socket
import time

import pytest
from redis.asyncio.retry import Retry as AsyncRetry
from redis.backoff import ExponentialWithJitterBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

from app.core.redis_policy import async_retry, sync_retry


@pytest.mark.unit
@pytest.mark.parametrize(
    ("factory", "cls"), [(sync_retry, Retry), (async_retry, AsyncRetry)]
)
def test_retry_policy_shape(factory, cls):
    retry = factory()
    assert isinstance(retry, cls)
    assert isinstance(retry._backoff, ExponentialWithJitterBackoff)
    assert retry._retries == 1


@pytest.mark.unit
@pytest.mark.parametrize("factory", [sync_retry, async_retry])
def test_retry_policy_returns_fresh_objects(factory):
    a, b = factory(), factory()
    assert a is not b
    assert a._backoff is not b._backoff


@pytest.mark.unit
def test_sync_status_client_fails_fast_when_redis_unreachable(monkeypatch):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    # socket closed: nothing listens on `port`
    monkeypatch.setenv("REDIS_HOST", "127.0.0.1")
    monkeypatch.setenv("REDIS_PORT", str(port))
    monkeypatch.delenv("REDIS_AUTH", raising=False)

    from app.services.sync_status import _get_redis

    client = _get_redis()
    assert client is not None
    start = time.monotonic()
    with pytest.raises(RedisError):
        client.set("k", "v")
    assert time.monotonic() - start < 1.5

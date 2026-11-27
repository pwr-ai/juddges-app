"""Fail-fast retry policy shared by every backend Redis client.

redis-py 8 changed the default per-connection retry to 10 attempts with
exponential backoff, which makes a call against an unreachable Redis block for
~4.5 s before raising. Every caller here already falls back on error (in-process
cache, skipped cache, ...), so we pin one explicit policy independent of the
installed redis-py version: a single quick retry for transient blips, then fail.
"""

from redis.asyncio.retry import Retry as AsyncRetry
from redis.backoff import ExponentialWithJitterBackoff
from redis.retry import Retry


def _backoff() -> ExponentialWithJitterBackoff:
    return ExponentialWithJitterBackoff(base=0.01, cap=0.1)


def sync_retry() -> Retry:
    """Return a fresh retry policy for ``redis.Redis``."""
    return Retry(_backoff(), 1)


def async_retry() -> AsyncRetry:
    """Return a fresh retry policy for ``redis.asyncio.Redis``."""
    return AsyncRetry(_backoff(), 1)

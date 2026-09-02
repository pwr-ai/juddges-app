"""Unit tests for the anonymous-search quota (issues #510, #565).

Guests may search the public corpus without an account. The quota is friction,
not a security boundary: it is keyed on a cookie the visitor can clear, and the
real backstop against scripted abuse is the IP limiter in ``app.rate_limiter``.
These tests pin the properties that matter — the cookie quota is enforced when
Redis is reachable, search stays up when it is not, the per-IP limiter actually
applies to ``/api/search/documents`` (it did not, issue #565), and an anonymous
caller can never steer the request onto the GPU embedding path.
"""

from __future__ import annotations

import pytest

from app import guest_sessions
from app.api.search import SEARCH_DOCUMENTS_RATE_LIMIT
from app.guest_sessions import (
    GUEST_SEARCH_LIMIT,
    SESSION_EXPIRY_HOURS,
    charge_guest_search,
    open_guest_search_quota,
)

pytestmark = pytest.mark.unit


class FakeRedis:
    """Minimal in-memory stand-in for the hash operations guest sessions use."""

    def __init__(self, *, fail: bool = False) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        # Redis reports -1 for a key that exists with no expiry set.
        self.ttls: dict[str, int] = {}
        self.fail = fail

    def _guard(self) -> None:
        if self.fail:
            raise ConnectionError("redis unavailable")

    async def exists(self, key: str) -> int:
        self._guard()
        return int(key in self.hashes)

    async def hset(
        self,
        key: str,
        field: str | None = None,
        value: str | None = None,
        *,
        mapping: dict[str, str] | None = None,
    ) -> int:
        # redis-py accepts both hset(name, key, value) and hset(name, mapping=...)
        self._guard()
        fields = dict(mapping) if mapping else {}
        if field is not None:
            fields[field] = str(value)
        self.hashes.setdefault(key, {}).update(fields)
        return len(fields)

    async def expire(self, key: str, seconds: int) -> bool:
        self._guard()
        if key not in self.hashes:
            return False
        self.ttls[key] = seconds
        return True

    async def hgetall(self, key: str) -> dict[str, str]:
        self._guard()
        return dict(self.hashes.get(key, {}))

    async def ttl(self, key: str) -> int:
        self._guard()
        return self.ttls.get(key, -1)

    async def hincrby(self, key: str, field: str, amount: int) -> int:
        self._guard()
        bucket = self.hashes.setdefault(key, {})
        value = int(bucket.get(field, 0)) + amount
        bucket[field] = str(value)
        return value

    async def delete(self, key: str) -> int:
        self._guard()
        return int(self.hashes.pop(key, None) is not None)


@pytest.fixture
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    client = FakeRedis()
    monkeypatch.setenv("REDIS_HOST", "redis-test")
    monkeypatch.setattr(guest_sessions, "get_redis_client", lambda: client)
    return client


async def test_quota_mints_a_session_when_the_visitor_has_no_cookie(fake_redis):
    quota = await open_guest_search_quota(None)

    assert quota.enforced is True
    assert quota.limit_reached is False
    assert quota.session_id
    assert quota.searches_remaining == GUEST_SEARCH_LIMIT


async def test_quota_reuses_an_existing_session(fake_redis):
    first = await open_guest_search_quota(None)
    second = await open_guest_search_quota(first.session_id)

    assert second.session_id == first.session_id


async def test_unknown_session_id_gets_a_fresh_session(fake_redis):
    quota = await open_guest_search_quota("expired-or-forged")

    assert quota.session_id != "expired-or-forged"
    assert quota.searches_remaining == GUEST_SEARCH_LIMIT


async def test_each_charged_search_reduces_the_remaining_allowance(fake_redis):
    session_id = (await open_guest_search_quota(None)).session_id

    remaining = [await charge_guest_search(session_id) for _ in range(3)]

    assert remaining == [
        GUEST_SEARCH_LIMIT - 1,
        GUEST_SEARCH_LIMIT - 2,
        GUEST_SEARCH_LIMIT - 3,
    ]


async def test_the_limiting_search_is_allowed_and_the_next_one_is_not(fake_redis):
    session_id = (await open_guest_search_quota(None)).session_id

    for _ in range(GUEST_SEARCH_LIMIT - 1):
        await charge_guest_search(session_id)

    last_allowed = await open_guest_search_quota(session_id)
    assert last_allowed.limit_reached is False
    assert last_allowed.searches_remaining == 1

    assert await charge_guest_search(session_id) == 0

    blocked = await open_guest_search_quota(session_id)
    assert blocked.limit_reached is True
    assert blocked.searches_remaining == 0


async def test_charging_a_search_re_asserts_the_session_ttl(fake_redis):
    """A charge must not leave an immortal key behind (issue #565).

    ``hset``/``hincrby`` recreate a hash that expired between the quota check
    and the charge. Without an explicit ``expire`` that resurrected key has no
    TTL and leaks forever on the Redis that also backs Celery.
    """
    session_id = (await open_guest_search_quota(None)).session_id
    session_key = f"guest:session:{session_id}"
    # Simulate the key having lost its expiry (or been recreated by the charge).
    fake_redis.ttls[session_key] = -1

    await charge_guest_search(session_id)

    assert fake_redis.ttls[session_key] == SESSION_EXPIRY_HOURS * 3600


async def test_quota_fails_open_when_redis_is_unreachable(monkeypatch):
    monkeypatch.setenv("REDIS_HOST", "redis-test")
    monkeypatch.setattr(
        guest_sessions, "get_redis_client", lambda: FakeRedis(fail=True)
    )

    quota = await open_guest_search_quota(None)

    assert quota.enforced is False
    assert quota.limit_reached is False
    assert quota.session_id is None


async def test_quota_is_inert_when_redis_is_not_configured(monkeypatch):
    monkeypatch.delenv("REDIS_HOST", raising=False)

    def explode() -> None:  # pragma: no cover - must never be called
        raise AssertionError("Redis must not be contacted when REDIS_HOST is unset")

    monkeypatch.setattr(guest_sessions, "get_redis_client", explode)

    quota = await open_guest_search_quota(None)

    assert quota.enforced is False
    assert quota.limit_reached is False


# ===== Endpoint wiring =====


class _FakeSearchService:
    configured = True

    def __init__(self) -> None:
        self.calls = 0
        self.last_kwargs: dict[str, object] = {}

    async def documents_search(self, **kwargs: object) -> dict[str, object]:
        self.calls += 1
        self.last_kwargs = dict(kwargs)
        return {
            "hits": [{"id": "doc-1", "title": "Doc 1"}],
            "query": "vat",
            "processingTimeMs": 3,
            "estimatedTotalHits": 1,
        }


@pytest.fixture
async def guest_client(valid_api_headers):
    """A signed-out visitor as the backend actually sees one.

    The browser never reaches this service directly — the Next.js BFF does, and
    it always presents the service API key. What makes the caller a guest is the
    absence of a Bearer token, not the absence of the key.
    """
    from httpx import ASGITransport, AsyncClient

    from app.server import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=dict(valid_api_headers),
    ) as ac:
        yield ac


@pytest.fixture
def fake_search_service():
    from app.api.search import get_search_service
    from app.server import app

    service = _FakeSearchService()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        yield service
    finally:
        app.dependency_overrides.clear()


async def test_anonymous_search_returns_results_and_advertises_the_allowance(
    guest_client, fake_redis, fake_search_service
):
    response = await guest_client.get("/api/search/documents", params={"q": "vat"})

    assert response.status_code == 200
    assert len(response.json()["documents"]) == 1
    assert response.headers["X-Guest-Search-Limit"] == str(GUEST_SEARCH_LIMIT)
    assert response.headers["X-Guest-Searches-Remaining"] == str(GUEST_SEARCH_LIMIT - 1)
    assert response.headers["X-Guest-Session-Id"]
    assert "guest_session_id" in response.cookies


async def test_anonymous_search_is_refused_once_the_allowance_is_spent(
    guest_client, fake_redis, fake_search_service
):
    for _ in range(GUEST_SEARCH_LIMIT):
        allowed = await guest_client.get("/api/search/documents", params={"q": "vat"})
        assert allowed.status_code == 200

    refused = await guest_client.get("/api/search/documents", params={"q": "vat"})

    assert refused.status_code == 429
    detail = refused.json()["detail"]
    assert detail["upgrade_url"] == "/auth/sign-up"
    assert str(GUEST_SEARCH_LIMIT) in detail["message"]
    # The blocked request must never reach Meilisearch.
    assert fake_search_service.calls == GUEST_SEARCH_LIMIT


async def test_signed_in_search_is_never_metered(
    authenticated_client, fake_redis, fake_search_service, monkeypatch
):
    from app.core.auth_jwt import AuthenticatedUser, get_optional_user
    from app.server import app

    app.dependency_overrides[get_optional_user] = lambda: AuthenticatedUser(
        user_data={"id": "user-1", "email": "u@example.com", "role": "authenticated"},
        access_token="test-bearer-token",
    )

    for _ in range(GUEST_SEARCH_LIMIT + 3):
        response = await authenticated_client.get(
            "/api/search/documents", params={"q": "vat"}
        )
        assert response.status_code == 200
        assert "X-Guest-Searches-Remaining" not in response.headers

    assert fake_redis.hashes == {}


async def test_anonymous_search_is_throttled_by_the_per_ip_limiter(
    guest_client, fake_search_service, monkeypatch
):
    """The documented backstop must actually fire (issue #565).

    The cookie quota is deliberately reset by clearing a cookie, so the only
    real limit on anonymous search is the per-IP one. ``REDIS_HOST`` is unset
    here so the cookie quota is inert and the 429 can only come from the
    limiter.
    """
    from app.server import app

    monkeypatch.delenv("REDIS_HOST", raising=False)

    # A blank query is a match-all search and skips the analytics background
    # task, so the loop stays a test of the limiter rather than of Supabase.
    allowed_per_window = int(SEARCH_DOCUMENTS_RATE_LIMIT.split("/")[0])
    app.state.limiter.reset()
    app.state.limiter.enabled = True
    try:
        for attempt in range(allowed_per_window):
            allowed = await guest_client.get("/api/search/documents")
            assert allowed.status_code == 200, f"throttled early at #{attempt + 1}"

        refused = await guest_client.get("/api/search/documents")
    finally:
        app.state.limiter.enabled = False
        app.state.limiter.reset()

    assert refused.status_code == 429
    assert "rate limit exceeded" in refused.text.lower()
    # The throttled request must never reach Meilisearch.
    assert fake_search_service.calls == allowed_per_window


async def test_signed_in_search_is_not_throttled_by_the_guest_allowance(
    authenticated_client, fake_redis, fake_search_service
):
    """The new per-IP decorator must not meter signed-in traffic at guest size."""
    from app.core.auth_jwt import AuthenticatedUser, get_optional_user
    from app.server import app

    app.dependency_overrides[get_optional_user] = lambda: AuthenticatedUser(
        user_data={"id": "user-1", "email": "u@example.com", "role": "authenticated"},
        access_token="test-bearer-token",
    )

    app.state.limiter.reset()
    app.state.limiter.enabled = True
    try:
        for _ in range(GUEST_SEARCH_LIMIT + 3):
            response = await authenticated_client.get("/api/search/documents")
            assert response.status_code == 200
            assert "X-Guest-Searches-Remaining" not in response.headers
    finally:
        app.state.limiter.enabled = False
        app.state.limiter.reset()

    assert fake_redis.hashes == {}


async def test_anonymous_search_never_reaches_the_embedding_path(
    guest_client, fake_redis, fake_search_service
):
    """An anonymous caller must not be able to ask for semantic search.

    ``semantic_ratio > 0`` sends the query to the TEI embedding service, so
    leaving it caller-controlled put the GPU path on the public surface.
    """
    response = await guest_client.get(
        "/api/search/documents", params={"q": "vat", "semantic_ratio": 1.0}
    )

    assert response.status_code == 200
    assert fake_search_service.last_kwargs["semantic_ratio"] == 0.0


async def test_signed_in_search_keeps_the_requested_semantic_ratio(
    authenticated_client, fake_redis, fake_search_service
):
    from app.core.auth_jwt import AuthenticatedUser, get_optional_user
    from app.server import app

    app.dependency_overrides[get_optional_user] = lambda: AuthenticatedUser(
        user_data={"id": "user-1", "email": "u@example.com", "role": "authenticated"},
        access_token="test-bearer-token",
    )

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "vat", "semantic_ratio": 1.0}
    )

    assert response.status_code == 200
    assert fake_search_service.last_kwargs["semantic_ratio"] == 1.0


async def test_anonymous_search_survives_a_guest_store_outage(
    guest_client, fake_search_service, monkeypatch
):
    monkeypatch.setenv("REDIS_HOST", "redis-test")
    monkeypatch.setattr(
        guest_sessions, "get_redis_client", lambda: FakeRedis(fail=True)
    )

    response = await guest_client.get("/api/search/documents", params={"q": "vat"})

    assert response.status_code == 200
    assert "X-Guest-Searches-Remaining" not in response.headers

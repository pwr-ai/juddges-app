"""
Unit tests for IDOR security fixes on /research-agent endpoints (fixes #211).

Verifies:
- All session-scoped endpoints require authentication (401/403 when no token).
- User B gets 404 (not 403) when accessing User A's session, to avoid
  existence disclosure.
- start_session requires authentication (anonymous sessions disabled).
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import verify_api_key
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TEST_API_KEY = "test-api-key-12345"
_USER_A_ID = "aaaaaaaa-0000-4000-a000-000000000001"
_USER_B_ID = "bbbbbbbb-0000-4000-b000-000000000002"
_VALID_SESSION_ID = str(uuid.uuid4())

# ---------------------------------------------------------------------------
# Helpers / stubs
# ---------------------------------------------------------------------------


def _make_user(user_id: str) -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": user_id,
            "email": f"{user_id[:8]}@example.com",
            "role": "authenticated",
        },
        access_token="fake-test-token",
    )


def _make_session_stub(owner_id: str):
    """Return a minimal session-like object owned by *owner_id*."""
    session = MagicMock()
    session.id = _VALID_SESSION_ID
    session.user_id = owner_id
    session.mode = "guided"
    session.initial_query = "test query"
    session.status = "planning"
    session.findings = []
    session.decision_points = []
    session.report = None
    created = MagicMock()
    created.isoformat.return_value = "2026-06-19T00:00:00+00:00"
    session.created_at = created
    return session


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def api_key_headers() -> dict[str, str]:
    """Headers containing a valid API key (bypassed via override)."""
    return {"X-API-Key": _TEST_API_KEY}


@pytest.fixture
def override_api_key():
    """Override verify_api_key so API key auth is bypassed."""

    async def _pass():
        return _TEST_API_KEY

    app.dependency_overrides[verify_api_key] = _pass
    yield
    app.dependency_overrides.pop(verify_api_key, None)


@pytest.fixture
def install_user_b(override_api_key):
    """Override JWT dep to authenticate as User B (also bypasses API key check)."""

    async def _resolver() -> AuthenticatedUser:
        return _make_user(_USER_B_ID)

    app.dependency_overrides[jwt_get_current_user] = _resolver
    yield
    app.dependency_overrides.pop(jwt_get_current_user, None)


# ---------------------------------------------------------------------------
# 401/403 Tests — unauthenticated requests must be rejected
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", "/research-agent/sessions"),
        ("GET", f"/research-agent/sessions/{_VALID_SESSION_ID}"),
        ("GET", f"/research-agent/sessions/{_VALID_SESSION_ID}/stream"),
        ("POST", f"/research-agent/sessions/{_VALID_SESSION_ID}/message"),
        ("POST", f"/research-agent/sessions/{_VALID_SESSION_ID}/stop"),
        ("GET", "/research-agent/sessions"),
    ],
)
async def test_unauthenticated_returns_401_or_403(
    client: AsyncClient,
    override_api_key,
    method: str,
    path: str,
) -> None:
    """Every session endpoint must return 401/403 when no Bearer token is supplied.

    The API key is bypassed via override so we're testing only the JWT layer.
    FastAPI's HTTPBearer returns 403 (Forbidden) when credentials are absent;
    either 401 or 403 is acceptable as an "unauthenticated" rejection.
    """
    kwargs: dict = {}
    if method == "POST" and path == "/research-agent/sessions":
        kwargs["json"] = {"query": "test query for auth check"}
    elif method == "POST" and path.endswith("/message"):
        kwargs["json"] = {"message": "hello"}

    response = await client.request(method, path, **kwargs)

    assert response.status_code in (401, 403), (
        f"{method} {path} should reject unauthenticated requests; "
        f"got {response.status_code}: {response.text}"
    )


# ---------------------------------------------------------------------------
# 404 Tests — User B accessing User A's session must get 404, not 200/403
# ---------------------------------------------------------------------------


async def test_get_session_wrong_user_returns_404(
    client: AsyncClient,
    install_user_b,
) -> None:
    """GET /sessions/{id}: User B gets 404 on User A's session (no existence disclosure)."""
    session_owned_by_a = _make_session_stub(owner_id=_USER_A_ID)

    with _patch_persistence(get_session_return=session_owned_by_a):
        response = await client.get(f"/research-agent/sessions/{_VALID_SESSION_ID}")

    assert response.status_code == 404, (
        f"Expected 404 for wrong-user access, got {response.status_code}: {response.text}"
    )


async def test_stream_session_wrong_user_returns_404(
    client: AsyncClient,
    install_user_b,
) -> None:
    """GET /sessions/{id}/stream: User B gets 404 on User A's session."""
    session_owned_by_a = _make_session_stub(owner_id=_USER_A_ID)

    with _patch_persistence(get_session_return=session_owned_by_a):
        response = await client.get(
            f"/research-agent/sessions/{_VALID_SESSION_ID}/stream"
        )

    assert response.status_code == 404, (
        f"Expected 404 for wrong-user SSE stream, got {response.status_code}: {response.text}"
    )


async def test_send_message_wrong_user_returns_404(
    client: AsyncClient,
    install_user_b,
) -> None:
    """POST /sessions/{id}/message: User B gets 404 on User A's session."""
    session_owned_by_a = _make_session_stub(owner_id=_USER_A_ID)

    with _patch_persistence(get_session_return=session_owned_by_a):
        response = await client.post(
            f"/research-agent/sessions/{_VALID_SESSION_ID}/message",
            json={"message": "inject!"},
        )

    assert response.status_code == 404, (
        f"Expected 404 for wrong-user message, got {response.status_code}: {response.text}"
    )


async def test_stop_session_wrong_user_returns_404(
    client: AsyncClient,
    install_user_b,
) -> None:
    """POST /sessions/{id}/stop: User B gets 404 on User A's session."""
    session_owned_by_a = _make_session_stub(owner_id=_USER_A_ID)

    with _patch_persistence(get_session_return=session_owned_by_a):
        response = await client.post(
            f"/research-agent/sessions/{_VALID_SESSION_ID}/stop"
        )

    assert response.status_code == 404, (
        f"Expected 404 for wrong-user stop, got {response.status_code}: {response.text}"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _patch_persistence(get_session_return=None, list_sessions_return=None):
    """Context manager that stubs _get_persistence() in the router."""
    import contextlib

    store = AsyncMock()
    store.get_session.return_value = get_session_return
    store.list_sessions.return_value = list_sessions_return or []
    store.create_session.return_value = None

    @contextlib.contextmanager
    def _ctx():
        with patch(
            "app.api.research_agent._get_persistence",
            return_value=(store, AsyncMock()),
        ):
            yield store

    return _ctx()

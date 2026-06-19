"""
Tests pinning the Bearer-JWT auth contract on /collections.

These tests document the migration from header-trusted ``X-User-ID`` to
Supabase Bearer JWT. They are written to fail against the legacy
``app.collections.get_current_user(x_user_id)`` dependency and pass once the
router consumes ``app.core.auth_jwt.get_current_user``.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]


@pytest.fixture
def valid_api_headers() -> dict[str, str]:
    return {"X-API-Key": "test-api-key-12345"}


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "00000000-0000-4000-a000-000000000abc",
            "email": "bearer-user@example.com",
            "role": "authenticated",
        },
        access_token="fake-jwt-token",
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class _StubCollectionsDb:
    """Minimal collections-db stub so tests exercise only the auth layer."""

    async def get_user_collections(self, _user_id: str) -> list[dict]:
        return []


@pytest.fixture
def override_jwt_user(fake_user: AuthenticatedUser):
    """Override the JWT dependency to return a stable test user."""

    async def _resolver() -> AuthenticatedUser:
        return fake_user

    async def _db_resolver() -> _StubCollectionsDb:
        return _StubCollectionsDb()

    app.dependency_overrides[jwt_get_current_user] = _resolver
    app.dependency_overrides[get_collections_db] = _db_resolver
    try:
        yield fake_user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collections_db, None)


async def test_collections_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate /collections."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.get("/collections", headers=headers)

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}. "
        "Bearer JWT is now required."
    )


async def test_collections_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches the handler with no X-User-ID."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-jwt-token",
    }

    response = await client.get("/collections", headers=headers)

    # With the db dep stubbed, the auth dep is the only thing standing
    # between the request and a 200. If the contract is right, we get a
    # 200; if we get 401/403/422, the auth path is wrong.
    assert response.status_code == 200, (
        f"Bearer auth path returned {response.status_code}; expected 200. "
        f"Body: {response.text[:300]}"
    )


async def test_collections_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected."""
    response = await client.get("/collections", headers=valid_api_headers)

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )

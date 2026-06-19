"""
Tests pinning the Bearer-JWT auth contract on /publications.

These tests document the migration from header-trusted ``X-User-ID`` to
Supabase Bearer JWT (issue #231).  They verify:

- Mutating endpoints (POST, PUT, DELETE) reject requests that only carry
  X-User-ID and no Bearer token.
- Mutating endpoints accept a Bearer-authenticated request when the JWT dep
  is overridden with a synthetic user (no real Supabase call required).
- Read endpoints (GET) remain publicly accessible without any user credential.

Per-endpoint auth decisions
---------------------------
POST /publications  → required auth  (creates a record attributed to user_id)
PUT  /publications/{id} → required auth  (mutating, admin-level operation)
DELETE /publications/{id} → required auth  (mutating, admin-level operation)
GET  /publications       → public read    (no user dep on this endpoint)
GET  /publications/{id}  → public read    (no user dep on this endpoint)
"""

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_publications_db

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]


@pytest.fixture
def valid_api_headers() -> dict[str, str]:
    return {"X-API-Key": "test-api-key-12345"}


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "00000000-0000-4000-a000-000000000abc",
            "email": "bearer-pub-user@example.com",
            "role": "authenticated",
        },
        access_token="fake-pub-jwt-token",
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class _StubPublicationsDb:
    """Minimal publications-db stub so tests exercise only the auth layer."""

    async def get_publications(self, **_kwargs) -> list[dict]:
        return []

    async def create_publication(self, data: dict) -> dict:
        return {
            "id": "stub-pub-id",
            "title": data.get("title", "Stub"),
            "authors": data.get("authors", []),
            "venue": data.get("venue", "Stub Venue"),
            "venue_short": None,
            "year": data.get("year", 2024),
            "month": None,
            "abstract": data.get("abstract", "Stub abstract"),
            "project": data.get("project", "JuDDGES"),
            "type": data.get("type", "conference"),
            "status": data.get("status", "published"),
            "links": {},
            "tags": [],
            "citations": None,
            "manuscript_number": None,
            "acceptance_date": None,
            "publication_date": None,
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
            "publication_schemas": [],
            "publication_collections": [],
            "publication_extraction_jobs": [],
        }

    async def update_publication(self, _pub_id: str, _data: dict) -> dict:
        return self.create_publication.__wrapped__(self, {})  # type: ignore[attr-defined]

    async def delete_publication(self, _pub_id: str) -> bool:
        return True


@pytest.fixture
def override_jwt_user(fake_user: AuthenticatedUser):
    """Override the JWT dependency to return a stable test user."""

    async def _resolver() -> AuthenticatedUser:
        return fake_user

    async def _db_resolver() -> _StubPublicationsDb:
        return _StubPublicationsDb()

    app.dependency_overrides[jwt_get_current_user] = _resolver
    app.dependency_overrides[get_publications_db] = _db_resolver
    try:
        yield fake_user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_publications_db, None)


@pytest.fixture
def db_only_override():
    """Override only the db dep (for public endpoints that need no auth)."""

    async def _db_resolver() -> _StubPublicationsDb:
        return _StubPublicationsDb()

    app.dependency_overrides[get_publications_db] = _db_resolver
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_publications_db, None)


# ---------------------------------------------------------------------------
# POST /publications — requires auth
# ---------------------------------------------------------------------------


async def test_create_publication_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate POST /publications."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.post(
        "/publications",
        headers=headers,
        json={
            "title": "Test",
            "authors": [{"name": "Author"}],
            "venue": "Venue",
            "year": 2024,
            "abstract": "Abstract",
            "project": "JuDDGES",
            "type": "conference",
            "status": "published",
        },
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}. "
        "Bearer JWT is now required for POST /publications."
    )


async def test_create_publication_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone (no Bearer, no X-User-ID) must be rejected for POST."""
    response = await client.post(
        "/publications",
        headers=valid_api_headers,
        json={
            "title": "Test",
            "authors": [{"name": "Author"}],
            "venue": "Venue",
            "year": 2024,
            "abstract": "Abstract",
            "project": "JuDDGES",
            "type": "conference",
            "status": "published",
        },
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


async def test_create_publication_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches POST /publications handler."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-pub-jwt-token",
    }

    response = await client.post(
        "/publications",
        headers=headers,
        json={
            "title": "Bearer Auth Test Publication",
            "authors": [{"name": "Test Author"}],
            "venue": "Test Venue",
            "year": 2024,
            "abstract": "Test abstract for bearer auth validation.",
            "project": "JuDDGES",
            "type": "conference",
            "status": "published",
        },
    )

    assert response.status_code == 201, (
        f"Bearer auth path returned {response.status_code}; expected 201. "
        f"Body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# PUT /publications/{id} — requires auth
# ---------------------------------------------------------------------------


async def test_update_publication_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate PUT /publications/{id}."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.put(
        "/publications/stub-pub-id",
        headers=headers,
        json={"title": "Updated Title"},
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}."
    )


async def test_update_publication_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone must be rejected for PUT /publications/{id}."""
    response = await client.put(
        "/publications/stub-pub-id",
        headers=valid_api_headers,
        json={"title": "Updated Title"},
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


# ---------------------------------------------------------------------------
# DELETE /publications/{id} — requires auth
# ---------------------------------------------------------------------------


async def test_delete_publication_rejects_x_user_id_without_bearer(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """X-User-ID alone must no longer authenticate DELETE /publications/{id}."""
    headers = {**valid_api_headers, "X-User-ID": "00000000-0000-4000-a000-000000000abc"}

    response = await client.delete(
        "/publications/stub-pub-id",
        headers=headers,
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when only X-User-ID is supplied; got {response.status_code}."
    )


async def test_delete_publication_missing_all_auth_returns_unauthorized(
    client: AsyncClient, valid_api_headers: dict[str, str]
) -> None:
    """API key alone must be rejected for DELETE /publications/{id}."""
    response = await client.delete(
        "/publications/stub-pub-id",
        headers=valid_api_headers,
    )

    assert response.status_code in (401, 403), (
        f"Expected 401/403 when no user credential is supplied; got {response.status_code}."
    )


async def test_delete_publication_accepts_bearer_jwt(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    override_jwt_user: AuthenticatedUser,
) -> None:
    """A Bearer-authenticated request reaches DELETE /publications/{id} handler."""
    headers = {
        **valid_api_headers,
        "Authorization": "Bearer fake-pub-jwt-token",
    }

    response = await client.delete(
        "/publications/stub-pub-id",
        headers=headers,
    )

    # With the db dep stubbed to return True, auth is the only guard.
    # 200 = handler reached; 400 = ID validation failed (also means auth passed).
    assert response.status_code in (200, 400), (
        f"Bearer auth path for DELETE returned {response.status_code}; "
        f"expected 200 or 400 (auth passed). Body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# GET /publications — public read (no user dep)
# ---------------------------------------------------------------------------


async def test_list_publications_is_publicly_accessible(
    client: AsyncClient,
    valid_api_headers: dict[str, str],
    db_only_override,
) -> None:
    """GET /publications requires no user credential — it is a public endpoint."""
    response = await client.get("/publications", headers=valid_api_headers)

    assert response.status_code == 200, (
        f"Public GET /publications returned {response.status_code}; "
        f"expected 200. Body: {response.text[:300]}"
    )
    assert isinstance(response.json(), list)

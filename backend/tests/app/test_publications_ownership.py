"""
Ownership contract for mutating /publications endpoints (issue #420).

``create_publication`` attributes every record to its creator via ``user_id``,
but ``PUT`` and ``DELETE`` used to bind the authenticated user without ever
reading it — any valid JWT could modify any publication. The backend talks to
Supabase with the service-role key, so row-level security is bypassed and
offers no backstop.

The contract pinned here:

PUT    /publications/{id} → owner or admin, otherwise 403
DELETE /publications/{id} → owner or admin, otherwise 403
Both                      → 404 when the publication does not exist

A denied request must not reach the database.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_publications_db

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.security]

OWNER_ID = "00000000-0000-4000-a000-000000000001"
OTHER_ID = "00000000-0000-4000-a000-000000000002"
ADMIN_ID = "00000000-0000-4000-a000-000000000003"

PUBLICATION_ID = "11111111-1111-4111-a111-111111111111"
MISSING_PUBLICATION_ID = "22222222-2222-4222-a222-222222222222"

UPDATE_BODY = {"title": "Edited by someone"}


def _user(user_id: str, *, is_admin: bool = False) -> AuthenticatedUser:
    user_data = {
        "id": user_id,
        "email": f"{user_id}@example.com",
        "role": "authenticated",
    }
    if is_admin:
        user_data["app_metadata"] = {"is_admin": True}
    return AuthenticatedUser(user_data=user_data, access_token="fake-jwt")


class _StubPublicationsDb:
    """Publications db stub that records whether a mutation was attempted."""

    def __init__(self, owner_id: str = OWNER_ID) -> None:
        self.owner_id = owner_id
        self.update_calls: list[tuple[str, dict]] = []
        self.delete_calls: list[str] = []

    def _row(self) -> dict:
        return {
            "id": PUBLICATION_ID,
            "user_id": self.owner_id,
            "title": "Original title",
            "authors": [],
            "venue": "Stub Venue",
            "venue_short": None,
            "year": 2024,
            "month": None,
            "abstract": "Stub abstract",
            "project": "JuDDGES",
            "type": "conference",
            "status": "published",
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

    async def get_publication(self, publication_id: str) -> dict | None:
        if publication_id == MISSING_PUBLICATION_ID:
            return None
        return self._row()

    async def update_publication(self, publication_id: str, data: dict) -> dict:
        self.update_calls.append((publication_id, data))
        return self._row()

    async def delete_publication(self, publication_id: str) -> bool:
        self.delete_calls.append(publication_id)
        return True


@pytest.fixture
def valid_api_headers() -> dict[str, str]:
    return {"X-API-Key": "test-api-key-12345"}


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def stub_db() -> _StubPublicationsDb:
    return _StubPublicationsDb()


@pytest.fixture
def as_user(stub_db: _StubPublicationsDb):
    """Bind a caller identity and the recording db stub to the app."""

    def _bind(user: AuthenticatedUser) -> _StubPublicationsDb:
        async def _user_resolver() -> AuthenticatedUser:
            return user

        async def _db_resolver() -> _StubPublicationsDb:
            return stub_db

        app.dependency_overrides[jwt_get_current_user] = _user_resolver
        app.dependency_overrides[get_publications_db] = _db_resolver
        return stub_db

    yield _bind

    app.dependency_overrides.pop(jwt_get_current_user, None)
    app.dependency_overrides.pop(get_publications_db, None)


# ---------------------------------------------------------------------------
# Denied: a caller who neither owns the record nor is an admin
# ---------------------------------------------------------------------------


async def test_update_rejects_non_owner(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OTHER_ID))

    response = await client.put(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
        json=UPDATE_BODY,
    )

    assert response.status_code == 403
    assert db.update_calls == []


async def test_delete_rejects_non_owner(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OTHER_ID))

    response = await client.delete(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
    )

    assert response.status_code == 403
    assert db.delete_calls == []


# ---------------------------------------------------------------------------
# Allowed: the owner
# ---------------------------------------------------------------------------


async def test_update_allows_owner(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OWNER_ID))

    response = await client.put(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
        json=UPDATE_BODY,
    )

    assert response.status_code == 200
    assert len(db.update_calls) == 1


async def test_delete_allows_owner(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OWNER_ID))

    response = await client.delete(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
    )

    assert response.status_code == 200
    assert db.delete_calls == [PUBLICATION_ID]


# ---------------------------------------------------------------------------
# Allowed: an admin acting on someone else's record
# ---------------------------------------------------------------------------


async def test_update_allows_admin_on_foreign_publication(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(ADMIN_ID, is_admin=True))

    response = await client.put(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
        json=UPDATE_BODY,
    )

    assert response.status_code == 200
    assert len(db.update_calls) == 1


async def test_delete_allows_admin_on_foreign_publication(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(ADMIN_ID, is_admin=True))

    response = await client.delete(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
    )

    assert response.status_code == 200
    assert db.delete_calls == [PUBLICATION_ID]


# ---------------------------------------------------------------------------
# Missing records are 404, and stay distinguishable from 403
# ---------------------------------------------------------------------------


async def test_update_missing_publication_is_404(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OWNER_ID))

    response = await client.put(
        f"/publications/{MISSING_PUBLICATION_ID}",
        headers=valid_api_headers,
        json=UPDATE_BODY,
    )

    assert response.status_code == 404
    assert db.update_calls == []


async def test_delete_missing_publication_is_404(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    db = as_user(_user(OWNER_ID))

    response = await client.delete(
        f"/publications/{MISSING_PUBLICATION_ID}",
        headers=valid_api_headers,
    )

    assert response.status_code == 404
    assert db.delete_calls == []


async def test_non_owner_cannot_distinguish_denial_from_a_real_edit(
    client: AsyncClient, as_user, valid_api_headers: dict[str, str]
) -> None:
    """A refused update must not leak the stored record back to the caller."""
    db = as_user(_user(OTHER_ID))

    response = await client.put(
        f"/publications/{PUBLICATION_ID}",
        headers=valid_api_headers,
        json=UPDATE_BODY,
    )

    assert response.status_code == 403
    assert "Original title" not in response.text
    assert db.update_calls == []

"""
Unit tests for the batch-add cap (issue #166).

Exercises the ``POST /{collection_id}/documents/batch`` endpoint at the
schema-validation and handler layers without hitting a real Supabase instance.
The DB dependency is replaced by ``_StubCollectionsDb``, which mirrors the
real ``bulk_add_documents`` return contract.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

_VALID_COLLECTION_ID = "00000000-0000-4000-a000-000000000001"
_VALID_DOC_ID = "00000000-0000-4000-a000-000000000002"
_VALID_API_HEADERS = {"X-API-Key": "test-api-key-12345"}


# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------


class _StubCollectionsDb:
    """Minimal stub: returns a canned bulk_add_documents result."""

    async def find_collection(self, collection_id: str, user_id: str, **_kwargs):
        # Return a minimal collection dict so ownership check passes.
        return {"id": collection_id, "user_id": user_id}

    async def bulk_add_documents(
        self, collection_id: str, judgment_ids: list[str], user_id: str
    ) -> dict:
        return {"added": list(judgment_ids), "failed": []}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_data={
            "id": "00000000-0000-4000-a000-000000000abc",
            "email": "batch-test@example.com",
            "role": "authenticated",
        },
        access_token="fake-jwt-token",
    )


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def override_deps(fake_user: AuthenticatedUser):
    """Install both the JWT user stub and the DB stub, then clean up."""

    async def _jwt_resolver() -> AuthenticatedUser:
        return fake_user

    async def _db_resolver() -> _StubCollectionsDb:
        return _StubCollectionsDb()

    app.dependency_overrides[jwt_get_current_user] = _jwt_resolver
    app.dependency_overrides[get_collections_db] = _db_resolver
    try:
        yield fake_user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collections_db, None)


def _batch_url(collection_id: str = _VALID_COLLECTION_ID) -> str:
    return f"/collections/{collection_id}/documents/batch"


# ---------------------------------------------------------------------------
# Tests — schema validation (no db interaction needed)
# ---------------------------------------------------------------------------


async def test_batch_rejects_empty_list(
    client: AsyncClient, override_deps: AuthenticatedUser
) -> None:
    """Pydantic min_length=1 must reject an empty document_ids list."""
    response = await client.post(
        _batch_url(),
        json={"document_ids": []},
        headers=_VALID_API_HEADERS,
    )
    assert response.status_code == 422, (
        f"Expected 422 for empty list; got {response.status_code}. Body: {response.text[:300]}"
    )


async def test_batch_accepts_single_document(
    client: AsyncClient, override_deps: AuthenticatedUser
) -> None:
    """A list of 1 document must be accepted (min_length=1)."""
    response = await client.post(
        _batch_url(),
        json={"document_ids": [_VALID_DOC_ID]},
        headers=_VALID_API_HEADERS,
    )
    assert response.status_code == 200, (
        f"Expected 200 for single document; got {response.status_code}. Body: {response.text[:300]}"
    )
    data = response.json()
    assert data["total_requested"] == 1
    assert len(data["added"]) == 1
    assert data["failed"] == []


async def test_batch_accepts_exactly_100_documents(
    client: AsyncClient, override_deps: AuthenticatedUser
) -> None:
    """A list of exactly 100 documents must be accepted (max_length=100)."""
    doc_ids = [f"00000000-0000-4000-a000-{i:012x}" for i in range(100)]
    response = await client.post(
        _batch_url(),
        json={"document_ids": doc_ids},
        headers=_VALID_API_HEADERS,
    )
    assert response.status_code == 200, (
        f"Expected 200 for 100 documents; got {response.status_code}. Body: {response.text[:300]}"
    )
    data = response.json()
    assert data["total_requested"] == 100
    assert len(data["added"]) == 100
    assert data["failed"] == []


async def test_batch_rejects_101_documents(
    client: AsyncClient, override_deps: AuthenticatedUser
) -> None:
    """Pydantic max_length=100 must reject a list of 101 document IDs with 422."""
    doc_ids = [f"00000000-0000-4000-a000-{i:012x}" for i in range(101)]
    response = await client.post(
        _batch_url(),
        json={"document_ids": doc_ids},
        headers=_VALID_API_HEADERS,
    )
    assert response.status_code == 422, (
        f"Expected 422 for 101 documents (over cap); got {response.status_code}. "
        f"Body: {response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# Tests — response shape
# ---------------------------------------------------------------------------


async def test_batch_response_contains_expected_keys(
    client: AsyncClient, override_deps: AuthenticatedUser
) -> None:
    """Successful batch response must carry message/added/failed/total_requested."""
    response = await client.post(
        _batch_url(),
        json={"document_ids": [_VALID_DOC_ID]},
        headers=_VALID_API_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    for key in ("message", "added", "failed", "total_requested"):
        assert key in data, f"Missing key '{key}' in response: {data}"

"""GET /collections carries the PL/UK pair reference (issue #684, Task 10).

`transform_collection` now takes an optional `pair` dict from
`CollectionPairsDB.pairs_by_collection(user_id)` (one call per list request,
no N+1) and surfaces it as `CollectionPairRef | None` on each collection.

The pair lookup is best-effort (review round 1): `list_pairs` ->
`_handle_error` raises `HTTPException` on any `PostgrestAPIError`, and a
transient failure on the low-traffic `collection_pairs` table must not break
the core list endpoint -- `test_list_collections_degrades_when_pairs_lookup_fails`
covers that.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

from app.collection_pairs import get_collection_pairs_db
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

USER = "22222222-2222-4222-8222-222222222222"
_ROW = {
    "user_id": USER,
    "description": None,
    "created_at": "2026-09-21T00:00:00Z",
    "updated_at": "2026-09-21T00:00:00Z",
}


class _Cols:
    async def get_user_collections(self, user_id):
        return [
            {
                **_ROW,
                "id": "c-pl",
                "name": "Q — PL",
                "collection_judgments": [{"judgment_id": "a"}],
                "document_count": 1,
            },
            {
                **_ROW,
                "id": "c-uk",
                "name": "Q — UK",
                "collection_judgments": [],
                "document_count": 0,
            },
            {
                **_ROW,
                "id": "c-solo",
                "name": "solo",
                "collection_judgments": [],
                "document_count": 0,
            },
        ]


class _Pairs:
    async def pairs_by_collection(self, user_id):
        return {
            "c-pl": {
                "id": "p1",
                "name": "Q",
                "role": "PL",
                "partner_collection_id": "c-uk",
            },
            "c-uk": {
                "id": "p1",
                "name": "Q",
                "role": "UK",
                "partner_collection_id": "c-pl",
            },
        }


class _FailingPairs:
    """Mimics `pairs_by_collection` -> `list_pairs` -> `_handle_error` on a
    PostgrestAPIError: it raises `HTTPException(500)`."""

    async def pairs_by_collection(self, user_id):
        raise HTTPException(status_code=500, detail="collection_pairs unavailable")


async def _get_collections():
    async def _user():
        return AuthenticatedUser(
            user_data={"id": USER, "email": "u@x.test", "role": "authenticated"},
            access_token="t",
        )

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: _Cols()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-API-Key": "test-api-key-12345"},
        ) as ac:
            return await ac.get("/collections")
    finally:
        app.dependency_overrides.clear()


async def test_list_collections_marks_paired_collections():
    app.dependency_overrides[get_collection_pairs_db] = lambda: _Pairs()
    response = await _get_collections()

    assert response.status_code == 200
    by_id = {c["id"]: c for c in response.json()}
    assert by_id["c-pl"]["pair"] == {
        "id": "p1",
        "name": "Q",
        "role": "PL",
        "partner_collection_id": "c-uk",
    }
    assert by_id["c-uk"]["pair"]["role"] == "UK"
    assert by_id["c-solo"]["pair"] is None

    # The pair annotation is additive: everything else about a paired
    # collection's shape is untouched.
    assert by_id["c-pl"]["name"] == "Q — PL"
    assert by_id["c-pl"]["document_count"] == 1
    assert by_id["c-pl"]["documents"] == ["a"]
    assert by_id["c-uk"]["name"] == "Q — UK"
    assert by_id["c-uk"]["document_count"] == 0
    assert by_id["c-uk"]["documents"] == []


async def test_list_collections_degrades_when_pairs_lookup_fails():
    """A transient failure on collection_pairs must not break /collections
    (review round 1): all collections still come back, each with pair: null."""
    app.dependency_overrides[get_collection_pairs_db] = lambda: _FailingPairs()
    response = await _get_collections()

    assert response.status_code == 200
    by_id = {c["id"]: c for c in response.json()}
    assert set(by_id) == {"c-pl", "c-uk", "c-solo"}
    assert by_id["c-pl"]["pair"] is None
    assert by_id["c-uk"]["pair"] is None
    assert by_id["c-solo"]["pair"] is None
    # Collection data itself is intact, not just present.
    assert by_id["c-pl"]["name"] == "Q — PL"
    assert by_id["c-pl"]["document_count"] == 1

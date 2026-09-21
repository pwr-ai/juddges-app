"""GET /collections carries the PL/UK pair reference (issue #684, Task 10).

`transform_collection` now takes an optional `pair` dict from
`CollectionPairsDB.pairs_by_collection(user_id)` (one call per list request,
no N+1) and surfaces it as `CollectionPairRef | None` on each collection.
"""

from __future__ import annotations

import pytest
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


async def test_list_collections_marks_paired_collections():
    async def _user():
        return AuthenticatedUser(
            user_data={"id": USER, "email": "u@x.test", "role": "authenticated"},
            access_token="t",
        )

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: _Cols()
    app.dependency_overrides[get_collection_pairs_db] = lambda: _Pairs()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-API-Key": "test-api-key-12345"},
        ) as ac:
            response = await ac.get("/collections")
    finally:
        app.dependency_overrides.clear()

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

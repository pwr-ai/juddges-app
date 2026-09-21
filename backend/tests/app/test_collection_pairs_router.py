"""GET/DELETE /collections/pairs* — read/unlink a PL/UK pair; precedence over /collections/{id}.

Creation lives on POST /collections/from-filter (split_by_jurisdiction=true) and
is covered in test_collections_from_filter.py.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.collection_pairs import get_collection_pairs_db
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

_HEADERS = {"X-API-Key": "test-api-key-12345"}
USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
PAIR = "33333333-3333-4333-8333-333333333333"
PL_COL = "44444444-4444-4444-8444-444444444444"
UK_COL = "55555555-5555-4555-8555-555555555555"


class _StubPairsDb:
    def __init__(self):
        self.rows: list[dict] = []

    async def create_pair(
        self, user_id, name, filters, text_query, pl_collection_id, uk_collection_id
    ):
        row = {
            "id": PAIR,
            "user_id": user_id,
            "name": name,
            "filters": filters,
            "text_query": text_query,
            "pl_collection_id": pl_collection_id,
            "uk_collection_id": uk_collection_id,
            "created_at": "2026-09-21T00:00:00Z",
            "updated_at": "2026-09-21T00:00:00Z",
        }
        self.rows.append(row)
        return row

    async def list_pairs(self, user_id):
        return [r for r in self.rows if r["user_id"] == user_id]

    async def find_pair(self, pair_id, user_id):
        return next(
            (r for r in self.rows if r["id"] == pair_id and r["user_id"] == user_id),
            None,
        )

    async def delete_pair(self, pair_id, user_id):
        before = len(self.rows)
        self.rows = [
            r for r in self.rows if not (r["id"] == pair_id and r["user_id"] == user_id)
        ]
        return len(self.rows) < before


@pytest.fixture
def pairs_db():
    return _StubPairsDb()


@pytest.fixture
def override_deps(pairs_db):
    async def _user():
        return AuthenticatedUser(
            user_data={"id": USER, "email": "u@x.test", "role": "authenticated"},
            access_token="t",
        )

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collection_pairs_db] = lambda: pairs_db
    try:
        yield
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collection_pairs_db, None)


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=_HEADERS
    ) as ac:
        yield ac


async def test_pairs_route_wins_over_collection_id_catch_all(client, override_deps):
    """/collections/{collection_id} would otherwise swallow 'pairs' and answer 404."""
    response = await client.get("/collections/pairs")
    assert response.status_code == 200, response.text
    assert response.json() == []


async def test_list_pairs_returns_sides_without_document_count(
    client, override_deps, pairs_db
):
    await pairs_db.create_pair(
        USER, "Fraud", {"appellant": ["offender"]}, "q", PL_COL, UK_COL
    )
    await pairs_db.create_pair(OTHER, "not mine", {}, None, "x", "y")
    response = await client.get("/collections/pairs")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    pair = body[0]
    assert pair["id"] == PAIR and pair["name"] == "Fraud"
    assert pair["filters"] == {"appellant": ["offender"]} and pair["text_query"] == "q"
    assert pair["sides"] == [
        {"jurisdiction": "PL", "collection_id": PL_COL},
        {"jurisdiction": "UK", "collection_id": UK_COL},
    ]


async def test_get_pair_by_id(client, override_deps, pairs_db):
    await pairs_db.create_pair(USER, "p", {}, None, PL_COL, UK_COL)
    response = await client.get(f"/collections/pairs/{PAIR}")
    assert response.status_code == 200
    assert response.json()["sides"][1]["collection_id"] == UK_COL


async def test_get_pair_not_owned_is_404(client, override_deps, pairs_db):
    await pairs_db.create_pair(OTHER, "p", {}, None, PL_COL, UK_COL)
    assert (await client.get(f"/collections/pairs/{PAIR}")).status_code == 404


async def test_get_pair_with_non_uuid_id_is_404_without_touching_db(
    client, override_deps
):
    assert (await client.get("/collections/pairs/not-a-uuid")).status_code == 404


async def test_delete_pair_unlinks_only(client, override_deps, pairs_db):
    await pairs_db.create_pair(USER, "p", {}, None, PL_COL, UK_COL)
    gone = await client.delete(f"/collections/pairs/{PAIR}")
    assert gone.status_code == 204
    assert pairs_db.rows == []
    assert (await client.get(f"/collections/pairs/{PAIR}")).status_code == 404


async def test_delete_pair_not_owned_is_404(client, override_deps, pairs_db):
    await pairs_db.create_pair(OTHER, "p", {}, None, PL_COL, UK_COL)
    assert (await client.delete(f"/collections/pairs/{PAIR}")).status_code == 404
    assert len(pairs_db.rows) == 1

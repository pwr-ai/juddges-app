"""POST /collections/from-filter — save every judgment matching a filter as a collection.

Same stub style as test_collections_batch_cap.py; resolve_filter_ids is
monkeypatched so no RPC is touched.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from juddges_search.db.supabase_db import get_collections_db

import app.collections_from_filter as cff
from app.core.auth_jwt import AuthenticatedUser
from app.core.auth_jwt import get_current_user as jwt_get_current_user
from app.extraction_domain.filter_ids import FilterIdsResult
from app.server import app

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.collections]

_HEADERS = {"X-API-Key": "test-api-key-12345"}
_COLLECTION_ID = "00000000-0000-4000-a000-000000000001"
_OWNED_COLLECTION_ID = "00000000-0000-4000-a000-00000000c001"
_FOREIGN_COLLECTION_ID = "00000000-0000-4000-a000-00000000c0ff"


class _StubDb:
    def __init__(self):
        self.bulk_calls: list[list[str]] = []
        self.created: list[dict] = []
        self.deleted: list[str] = []
        self.fail_on_chunk: int | None = None
        self.delete_should_fail: bool = False
        self.owned_collection_ids: list[str] = []
        self.get_user_collections_calls: list[str] = []

    async def get_user_collections(self, user_id):
        self.get_user_collections_calls.append(user_id)
        return [{"id": cid} for cid in self.owned_collection_ids]

    async def create_collection(self, user_id, name, description=None):
        row = {
            "id": _COLLECTION_ID,
            "user_id": user_id,
            "name": name,
            "description": description,
            "created_at": "2026-09-20T00:00:00Z",
            "updated_at": "2026-09-20T00:00:00Z",
        }
        self.created.append(row)
        return row

    async def bulk_add_documents(self, collection_id, judgment_ids, user_id):
        chunk_index = len(self.bulk_calls)
        self.bulk_calls.append(list(judgment_ids))
        if self.fail_on_chunk is not None and chunk_index == self.fail_on_chunk:
            raise HTTPException(status_code=500, detail="Failed to add judgment: boom")
        return {"added": list(judgment_ids), "failed": []}

    async def delete_collection(self, collection_id, user_id):
        if self.delete_should_fail:
            raise RuntimeError("delete boom")
        self.deleted.append(collection_id)
        return True


def _ids(n: int) -> list[str]:
    return [f"00000000-0000-4000-a000-{i:012x}" for i in range(n)]


def _result(n: int) -> FilterIdsResult:
    ids = _ids(n)
    return FilterIdsResult(ids=ids, by_jurisdiction={"PL": ids, "UK": []})


@pytest.fixture
def stub_db():
    return _StubDb()


@pytest.fixture
def override_deps(stub_db, monkeypatch):
    user = AuthenticatedUser(
        user_data={
            "id": "00000000-0000-4000-a000-000000000abc",
            "email": "x@example.com",
            "role": "authenticated",
        },
        access_token="fake",
    )

    async def _user():
        return user

    app.dependency_overrides[jwt_get_current_user] = _user
    app.dependency_overrides[get_collections_db] = lambda: stub_db
    monkeypatch.setattr(cff, "supabase_client", object())  # "available"
    try:
        yield user
    finally:
        app.dependency_overrides.pop(jwt_get_current_user, None)
        app.dependency_overrides.pop(get_collections_db, None)


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


async def test_creates_collection_and_bulk_adds_in_chunks(
    client, override_deps, stub_db, monkeypatch
):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(2500))
    resp = await client.post(
        "/collections/from-filter",
        json={
            "name": "kobiety skazane za oszustwo, PL i UK, 2015-2024",
            "filters": {"jurisdiction": ["PL", "UK"]},
            "text_query": None,
        },
        headers=_HEADERS,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_matched"] == 2500 and body["pair_id"] is None
    assert len(body["collections"]) == 1
    created = body["collections"][0]
    assert created["jurisdiction"] is None
    assert (
        created["collection"]["id"] == _COLLECTION_ID and created["added_count"] == 2500
    )
    assert [len(c) for c in stub_db.bulk_calls] == [1000, 1000, 500]
    assert stub_db.created[0]["name"].startswith("kobiety")


async def test_bulk_add_failure_deletes_collection_and_propagates(
    client, override_deps, stub_db, monkeypatch
):
    """A chunk failing mid-way must not leave a partial collection visible."""
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(2500))
    stub_db.fail_on_chunk = 1  # second of three chunks (1000, 1000, 500) raises
    resp = await client.post(
        "/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS
    )
    assert resp.status_code == 500
    assert stub_db.deleted == [_COLLECTION_ID]


async def test_bulk_add_failure_with_failing_delete_still_propagates_original_error(
    client, override_deps, stub_db, monkeypatch
):
    """A failed compensating delete must not mask the original bulk-add error."""
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(1500))
    stub_db.fail_on_chunk = 1  # second of two chunks (1000, 500) raises
    stub_db.delete_should_fail = True
    resp = await client.post(
        "/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS
    )
    assert resp.status_code == 500
    assert resp.json()["detail"] == "Failed to add judgment: boom"
    assert stub_db.deleted == []


async def test_empty_result_is_400_and_creates_nothing(
    client, override_deps, stub_db, monkeypatch
):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(0))
    resp = await client.post(
        "/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "FILTER_EMPTY"
    assert stub_db.created == []


async def test_too_large_is_413_with_total_and_cap(
    client, override_deps, stub_db, monkeypatch
):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(5001))
    resp = await client.post(
        "/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS
    )
    assert resp.status_code == 413
    detail = resp.json()["detail"]
    assert (
        detail["code"] == "FILTER_TOO_LARGE"
        and detail["total"] == 5001
        and detail["cap"] == 5000
    )
    assert detail["jurisdiction"] is None
    assert stub_db.created == []


async def test_name_is_required_and_bounded(client, override_deps):
    assert (
        await client.post(
            "/collections/from-filter",
            json={"name": "", "filters": {}},
            headers=_HEADERS,
        )
    ).status_code == 422
    assert (
        await client.post(
            "/collections/from-filter",
            json={"name": "a" * 256, "filters": {}},
            headers=_HEADERS,
        )
    ).status_code == 422


async def test_503_without_database(client, override_deps, monkeypatch):
    monkeypatch.setattr(cff, "supabase_client", None)
    resp = await client.post(
        "/collections/from-filter", json={"name": "x", "filters": {}}, headers=_HEADERS
    )
    assert resp.status_code == 503


async def test_batch_cap_of_100_on_documents_batch_is_untouched(client, override_deps):
    """Guard: from-filter must not have loosened AddDocumentsRequest (#166)."""
    resp = await client.post(
        f"/collections/{_COLLECTION_ID}/documents/batch",
        json={"document_ids": _ids(101)},
        headers=_HEADERS,
    )
    assert resp.status_code == 422


async def test_collection_ids_filter_with_foreign_id_is_404(
    client, override_deps, stub_db, monkeypatch
):
    """A collection_ids entry the caller does not own must 404, without
    revealing which id was the problem, and must never reach resolve_filter_ids.
    """
    stub_db.owned_collection_ids = [_OWNED_COLLECTION_ID]
    resolve_calls: list[object] = []
    monkeypatch.setattr(
        cff,
        "resolve_filter_ids",
        lambda *a, **k: resolve_calls.append((a, k)) or _result(5),
    )
    resp = await client.post(
        "/collections/from-filter",
        json={
            "name": "x",
            "filters": {
                "collection_ids": [_OWNED_COLLECTION_ID, _FOREIGN_COLLECTION_ID]
            },
        },
        headers=_HEADERS,
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "COLLECTION_NOT_FOUND"
    assert resolve_calls == []
    assert stub_db.created == []


async def test_collection_ids_filter_with_non_uuid_is_400(
    client, override_deps, stub_db, monkeypatch
):
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(5))
    resp = await client.post(
        "/collections/from-filter",
        json={"name": "x", "filters": {"collection_ids": ["not-a-uuid"]}},
        headers=_HEADERS,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "INVALID_COLLECTION_ID"
    assert stub_db.created == []


async def test_collection_ids_filter_with_owned_ids_passes_through_unchanged(
    client, override_deps, stub_db, monkeypatch
):
    stub_db.owned_collection_ids = [_OWNED_COLLECTION_ID]
    seen: dict[str, object] = {}

    def _resolve(_client, filters, _text_query):
        seen["filters"] = filters
        return _result(3)

    monkeypatch.setattr(cff, "resolve_filter_ids", _resolve)
    filters = {"collection_ids": [_OWNED_COLLECTION_ID], "jurisdiction": ["PL"]}
    resp = await client.post(
        "/collections/from-filter",
        json={"name": "x", "filters": filters},
        headers=_HEADERS,
    )
    assert resp.status_code == 201, resp.text
    assert seen["filters"] == filters


async def test_collection_ids_empty_list_skips_ownership_check(
    client, override_deps, stub_db, monkeypatch
):
    """Mirrors the RPC's own semantics: an empty collection_ids list is 'no filter'."""
    monkeypatch.setattr(cff, "resolve_filter_ids", lambda *_a, **_k: _result(2))
    resp = await client.post(
        "/collections/from-filter",
        json={"name": "x", "filters": {"collection_ids": []}},
        headers=_HEADERS,
    )
    assert resp.status_code == 201, resp.text
    assert stub_db.get_user_collections_calls == []


async def test_create_collection_from_ids_is_reusable_without_http(stub_db):
    collection, added = await cff.create_collection_from_ids(
        stub_db, user_id="u", name="n", description=None, ids=_ids(1500)
    )
    assert collection["id"] == _COLLECTION_ID and added == 1500
    assert [len(c) for c in stub_db.bulk_calls] == [1000, 500]

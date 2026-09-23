"""POST /compare/facets — HTTP surface of the PL/UK comparison (Spec C).

Runs through the ASGI app with dependency overrides, like
test_collections_from_filter.py: the Bearer user is a synthetic
``AuthenticatedUser`` (``authenticated_client``), the collections DB is a stub
that answers ``get_user_collections`` from a list, and the facet RPC client is
a ``FakeRpcClient`` patched on ``app.compare.router.supabase_client`` so no
network is touched.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from juddges_search.db.supabase_db import get_collections_db

from app.compare.fields import base_compare_fields
from app.compare.service import FACET_RPC
from app.server import app
from tests.app._fakes import FakeRpcClient

pytestmark = [pytest.mark.anyio, pytest.mark.unit, pytest.mark.api]

_OWNED_COLLECTION_ID = "00000000-0000-4000-a000-00000000c001"
_FOREIGN_COLLECTION_ID = "00000000-0000-4000-a000-00000000c0ff"


def _rows(field: str):
    return [
        {
            "jurisdiction": "PL",
            "value": "a",
            "count": 4,
            "total": 5,
            "covered": 5,
            "coverage": 1.0,
        },
        {
            "jurisdiction": "UK",
            "value": "a",
            "count": 1,
            "total": 2,
            "covered": 2,
            "coverage": 1.0,
        },
    ]


def _client_returning(rows_by_field: dict[str, list[dict]]) -> FakeRpcClient:
    return FakeRpcClient(
        {FACET_RPC: lambda params: rows_by_field.get(params["field_path"], [])}
    )


class _StubDb:
    def __init__(self):
        self.owned_collection_ids: list[str] = []
        self.get_user_collections_calls: list[str] = []

    async def get_user_collections(self, user_id):
        self.get_user_collections_calls.append(user_id)
        return [{"id": cid} for cid in self.owned_collection_ids]


@pytest.fixture
def stub_db():
    db = _StubDb()
    app.dependency_overrides[get_collections_db] = lambda: db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_collections_db, None)


async def test_facets_requires_bearer_user(client, valid_api_headers, stub_db):
    response = await client.post(
        "/compare/facets", json={"filters": {}}, headers=valid_api_headers
    )
    assert response.status_code in (401, 403)


async def test_facets_returns_compare_response(authenticated_client, stub_db):
    fake = _client_returning({"appeal_outcome": _rows("appeal_outcome")})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={
                "filters": {"appellant": ["offender"]},
                "text_query": None,
                "fields": ["appeal_outcome"],
            },
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["totals"] == {"PL": 5, "UK": 2}
    assert body["fields"][0]["field"] == "appeal_outcome"
    assert body["fields"][0]["values"][0]["shares"] == {"PL": 0.8, "UK": 0.5}
    assert body["ignored_filter_keys"] == []
    assert fake.calls == [
        (
            FACET_RPC,
            {
                "p_filters": {"appellant": ["offender"]},
                "field_path": "appeal_outcome",
                "p_text_query": None,
            },
        )
    ]
    # No collection_ids in the filter: ownership lookup is skipped entirely.
    assert stub_db.get_user_collections_calls == []


async def test_facets_defaults_to_all_base_fields(authenticated_client, stub_db):
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}}
        )
    assert response.status_code == 200
    assert len(response.json()["fields"]) == 17
    assert len(fake.calls) == 17


async def test_facets_strips_jurisdiction_and_echoes_it(authenticated_client, stub_db):
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={"filters": {"jurisdiction": ["PL"]}, "fields": ["appellant"]},
        )
    assert response.status_code == 200, response.text
    assert response.json()["ignored_filter_keys"] == ["jurisdiction"]
    assert fake.calls[0][1]["p_filters"] == {}


async def test_facets_rejects_non_comparable_field(authenticated_client, stub_db):
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}, "fields": ["keywords"]}
        )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "UNKNOWN_FIELD"
    assert "keywords" in detail["message"]
    assert detail["fields"] == ["keywords"]
    assert fake.calls == []


# --- request-size guards: one RPC per field, so `fields` is bounded ----------


async def test_facets_dedupes_repeated_fields_to_one_rpc_each(
    authenticated_client, stub_db
):
    fake = _client_returning({})
    n = len(base_compare_fields())
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}, "fields": ["appellant"] * n}
        )
    assert response.status_code == 200, response.text
    assert [f["field"] for f in response.json()["fields"]] == ["appellant"]
    assert len(fake.calls) == 1


async def test_facets_rejects_more_fields_than_the_registry_has(
    authenticated_client, stub_db
):
    fake = _client_returning({})
    n = len(base_compare_fields())
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={"filters": {}, "fields": ["appellant"] * (n + 1)},
        )
    assert response.status_code == 422, response.text
    assert fake.calls == []


async def test_facets_503_without_database(authenticated_client, stub_db):
    with patch("app.compare.router.supabase_client", None):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}}
        )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "DATABASE_UNAVAILABLE"


async def test_facets_500_when_rpc_raises(authenticated_client, stub_db):
    def _boom(_params):
        raise RuntimeError("boom")

    fake = FakeRpcClient({FACET_RPC: _boom})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}, "fields": ["appellant"]}
        )
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "COMPARE_FAILED"


async def test_facets_runs_the_blocking_service_off_the_event_loop(
    authenticated_client, stub_db
):
    """The sync RPC loop must not run on the loop thread (asyncio.to_thread)."""
    import asyncio
    import threading

    loop_thread = threading.get_ident()
    seen: list[int] = []

    def _record(_params):
        seen.append(threading.get_ident())
        return []

    fake = FakeRpcClient({FACET_RPC: _record})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets", json={"filters": {}, "fields": ["appellant"]}
        )
    assert response.status_code == 200, response.text
    assert asyncio.get_running_loop() is not None
    assert seen and all(t != loop_thread for t in seen)


# --- collection_ids ownership (service-role client bypasses RLS) ------------


async def test_facets_foreign_collection_id_is_404_and_never_reaches_rpc(
    authenticated_client, stub_db
):
    stub_db.owned_collection_ids = [_OWNED_COLLECTION_ID]
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={
                "filters": {
                    "collection_ids": [_OWNED_COLLECTION_ID, _FOREIGN_COLLECTION_ID]
                },
                "fields": ["appellant"],
            },
        )
    assert response.status_code == 404, response.text
    assert response.json()["detail"]["code"] == "COLLECTION_NOT_FOUND"
    assert fake.calls == []
    assert stub_db.get_user_collections_calls == ["test-user-id-123"]


async def test_facets_non_uuid_collection_id_is_400(authenticated_client, stub_db):
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={
                "filters": {"collection_ids": ["not-a-uuid"]},
                "fields": ["appellant"],
            },
        )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_COLLECTION_ID"
    assert fake.calls == []
    # Malformed ids are rejected before any DB lookup.
    assert stub_db.get_user_collections_calls == []


async def test_facets_owned_collection_ids_pass_through_to_rpc(
    authenticated_client, stub_db
):
    stub_db.owned_collection_ids = [_OWNED_COLLECTION_ID]
    fake = _client_returning({})
    with patch("app.compare.router.supabase_client", fake):
        response = await authenticated_client.post(
            "/compare/facets",
            json={
                "filters": {"collection_ids": [_OWNED_COLLECTION_ID]},
                "fields": ["appellant"],
            },
        )
    assert response.status_code == 200, response.text
    assert fake.calls[0][1]["p_filters"] == {"collection_ids": [_OWNED_COLLECTION_ID]}
    assert stub_db.get_user_collections_calls == ["test-user-id-123"]

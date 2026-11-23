"""Facet pass-through on GET /api/search/documents.

The frontend's tag suggestions call it with ``q=""``, ``limit=0`` and repeated
``facets=base_<field>`` params. These tests pin that the facets reach Meilisearch
(with the same filters), come back as ``facetDistribution``, are validated, are
not charged to the guest allowance, and leave the no-facet path untouched.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

pytestmark = pytest.mark.unit

URL = "/api/search/documents"


def _service() -> MagicMock:
    from app.services.search import MeiliSearchService

    service = MagicMock(spec=MeiliSearchService)
    service.configured = True
    service.documents_search = AsyncMock(
        return_value={
            "hits": [],
            "estimatedTotalHits": 0,
            "processingTimeMs": 1,
            "query": "",
            "search_mode": "keyword",
        }
    )
    service.search = AsyncMock(
        return_value={
            "hits": [],
            "estimatedTotalHits": 7,
            "processingTimeMs": 2,
            "facetDistribution": {"base_keywords": {"vat": 3, "tax": 2}},
            "facetStats": {"base_year": {"min": 1990.0, "max": 2024.0}},
        }
    )
    service.facet_distribution_for_query = AsyncMock(
        return_value={"base_keywords": {"vat": 3}}
    )
    return service


@pytest.fixture
def svc():
    from app.api.search import get_search_service
    from app.server import app

    service = _service()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        yield service
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_facets_forwarded_and_returned(client, valid_api_headers, svc):
    resp = await client.get(
        URL,
        params=[
            ("q", ""),
            ("limit", "0"),
            ("facets", "base_keywords"),
            ("facets", "base_year"),
            ("filters", 'jurisdiction = "pl"'),
        ],
        headers=valid_api_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["facetDistribution"] == {"base_keywords": {"vat": 3, "tax": 2}}
    assert body["facetStats"] == {"base_year": {"min": 1990.0, "max": 2024.0}}
    kwargs = svc.search.await_args.kwargs
    assert kwargs["facets"] == ["base_keywords", "base_year"]
    assert kwargs["filters"] == 'jurisdiction = "pl"'
    assert kwargs["limit"] == 0
    svc.documents_search.assert_not_awaited()
    assert body["documents"] == []


@pytest.mark.anyio
async def test_facet_query_uses_facet_search(client, valid_api_headers, svc):
    resp = await client.get(
        URL,
        params=[
            ("limit", "0"),
            ("facets", "base_keywords"),
            ("facet_query", "va"),
            ("filters", 'jurisdiction = "pl"'),
        ],
        headers=valid_api_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["facetDistribution"] == {"base_keywords": {"vat": 3}}
    args = svc.facet_distribution_for_query.await_args
    assert args.args == (["base_keywords"], "va")
    assert args.kwargs["filters"] == 'jurisdiction = "pl"'
    svc.search.assert_not_awaited()


@pytest.mark.anyio
async def test_facet_query_runs_per_facet(client, valid_api_headers):
    from app.api.search import get_search_service
    from app.server import app
    from app.services.search import MeiliSearchService

    real = MeiliSearchService(
        base_url="http://meili:7700", api_key="k", index_name="judgments"
    )
    real.facet_search_counts = AsyncMock(side_effect=[{"a": 1}, {"b": 2}])
    app.dependency_overrides[get_search_service] = lambda: real
    try:
        resp = await client.get(
            URL,
            params=[
                ("limit", "0"),
                ("facets", "base_x"),
                ("facets", "base_y"),
                ("facet_query", "q"),
            ],
            headers=valid_api_headers,
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert resp.json()["facetDistribution"] == {
        "base_x": {"a": 1},
        "base_y": {"b": 2},
    }
    assert real.facet_search_counts.await_count == 2


@pytest.mark.anyio
async def test_facet_search_failure_is_502(client, valid_api_headers, svc):
    svc.facet_distribution_for_query = AsyncMock(side_effect=RuntimeError("boom"))
    resp = await client.get(
        URL,
        params=[("limit", "0"), ("facets", "base_keywords"), ("facet_query", "x")],
        headers=valid_api_headers,
    )
    assert resp.status_code == 502


@pytest.mark.anyio
async def test_non_facet_only_guest_call_is_charged(
    client, valid_api_headers, svc, monkeypatch
):
    import app.api.search as mod

    opened = AsyncMock(
        return_value=MagicMock(limit_reached=False, enforced=False, session_id=None)
    )
    monkeypatch.setattr(mod, "open_guest_search_quota", opened)
    resp = await client.get(
        URL,
        params=[("q", "vat"), ("limit", "0"), ("facets", "base_keywords")],
        headers=valid_api_headers,
    )
    assert resp.status_code == 200
    opened.assert_awaited_once()


@pytest.mark.anyio
async def test_facets_with_hits(client, valid_api_headers, svc):
    resp = await client.get(
        URL,
        params=[("q", "vat"), ("limit", "5"), ("facets", "base_keywords")],
        headers=valid_api_headers,
    )
    assert resp.status_code == 200
    svc.documents_search.assert_awaited_once()
    assert resp.json()["facetDistribution"] is not None


@pytest.mark.anyio
@pytest.mark.parametrize(
    "params",
    [
        [("limit", "0"), ("facets", "Bad Name")],
        [("limit", "0"), ("facets", 'x" OR 1=1')],
        [("limit", "0")] + [("facets", f"f{i}") for i in range(21)],
        [("limit", "0"), ("facet_query", "x")],
        [("limit", "0")],
    ],
)
async def test_invalid_requests_rejected(client, valid_api_headers, svc, params):
    resp = await client.get(URL, params=params, headers=valid_api_headers)
    assert resp.status_code == 422
    svc.search.assert_not_awaited()
    svc.documents_search.assert_not_awaited()


@pytest.mark.anyio
async def test_no_facets_path_unchanged(client, valid_api_headers, svc):
    resp = await client.get(
        URL, params={"q": "vat", "limit": "5"}, headers=valid_api_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["facetDistribution"] is None
    svc.search.assert_not_awaited()
    svc.facet_distribution_for_query.assert_not_awaited()
    assert svc.documents_search.await_args.kwargs["limit"] == 5


@pytest.mark.anyio
async def test_facet_only_does_not_touch_guest_quota(
    client, valid_api_headers, svc, monkeypatch
):
    import app.api.search as mod

    opened = AsyncMock()
    monkeypatch.setattr(mod, "open_guest_search_quota", opened)
    resp = await client.get(
        URL,
        params=[("limit", "0"), ("facets", "base_keywords")],
        headers=valid_api_headers,
    )
    assert resp.status_code == 200
    opened.assert_not_awaited()


@pytest.mark.anyio
async def test_meili_facet_failure_is_502(client, valid_api_headers, svc):
    svc.search.side_effect = RuntimeError("boom")
    resp = await client.get(
        URL,
        params=[("limit", "0"), ("facets", "base_keywords")],
        headers=valid_api_headers,
    )
    assert resp.status_code == 502

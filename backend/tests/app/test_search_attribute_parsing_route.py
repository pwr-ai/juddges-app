"""Route-level tests for query-time attribute parsing on /api/search/documents
(issue #192).

The general document-search endpoint gains an opt-in ``parse_attributes`` flag.
When off (default), behaviour is byte-identical to before — the service is
called with the raw query and the caller-supplied filter. When on, recognised
structural tokens (court, year, case number, jurisdiction, judge) are stripped
from the query, filterable attributes (jurisdiction, decision_date) become a
Meili filter clause, and searchable-only attributes are appended to the FTS
query.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

pytestmark = pytest.mark.unit


def _mock_service() -> MagicMock:
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
    return service


@pytest.mark.anyio
async def test_default_does_not_parse_attributes(client, valid_api_headers):
    """Without parse_attributes the service receives the raw query verbatim —
    base-search invariance."""
    from app.api.search import get_search_service
    from app.server import app

    service = _mock_service()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        resp = await client.get(
            "/api/search/documents",
            params={"q": "wyrok SN 2023 III CSK"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        kwargs = service.documents_search.await_args.kwargs
        assert kwargs["query"] == "wyrok SN 2023 III CSK"
        assert kwargs.get("filters") is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_parse_attributes_builds_filter_and_remainder(client, valid_api_headers):
    """With parse_attributes=true the acceptance-criteria query is split into a
    Meili filter (jurisdiction + decision_date) and an FTS remainder."""
    from app.api.search import get_search_service
    from app.server import app

    service = _mock_service()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        resp = await client.get(
            "/api/search/documents",
            params={"q": "wyrok SN 2023 III CSK", "parse_attributes": "true"},
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        kwargs = service.documents_search.await_args.kwargs
        flt = kwargs["filters"]
        assert flt is not None
        assert 'jurisdiction = "pl"' in flt
        assert 'decision_date >= "2023-01-01"' in flt
        assert 'decision_date <= "2023-12-31"' in flt
        # Court + case-number prefix are searchable, not filterable → FTS query.
        q = kwargs["query"]
        assert "2023" not in q  # year was consumed into the filter
        assert "SN" in q  # court appended as an FTS term
        assert "III CSK" in q
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_parse_attributes_merges_with_caller_filter(client, valid_api_headers):
    """A caller-supplied filter is preserved and AND-combined with the parsed
    filter rather than overwritten."""
    from app.api.search import get_search_service
    from app.server import app

    service = _mock_service()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        resp = await client.get(
            "/api/search/documents",
            params={
                "q": "rozwód 2022",
                "parse_attributes": "true",
                "filters": 'court_level = "supreme"',
            },
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        flt = service.documents_search.await_args.kwargs["filters"]
        assert 'court_level = "supreme"' in flt
        assert 'decision_date >= "2022-01-01"' in flt
        assert " AND " in flt
    finally:
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_parse_attributes_plain_query_is_unchanged(client, valid_api_headers):
    """A plain query with no recognised tokens yields no parsed filter even when
    the flag is on — base-search invariance is preserved."""
    from app.api.search import get_search_service
    from app.server import app

    service = _mock_service()
    app.dependency_overrides[get_search_service] = lambda: service
    try:
        resp = await client.get(
            "/api/search/documents",
            params={
                "q": "umowa najmu lokalu",
                "parse_attributes": "true",
            },
            headers=valid_api_headers,
        )
        assert resp.status_code == 200
        kwargs = service.documents_search.await_args.kwargs
        assert kwargs["query"] == "umowa najmu lokalu"
        assert kwargs.get("filters") is None
    finally:
        app.dependency_overrides.clear()

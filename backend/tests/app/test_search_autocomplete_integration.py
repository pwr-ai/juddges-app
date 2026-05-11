"""Integration tests for Meilisearch-backed autocomplete endpoint."""

from typing import Any
from unittest.mock import patch

import pytest

from app.server import app


@pytest.fixture(autouse=True)
def _clear_overrides():
    """Ensure dependency overrides are cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


async def test_autocomplete_returns_503_when_meilisearch_not_configured(
    authenticated_client,
    monkeypatch,
):
    monkeypatch.delenv("MEILISEARCH_URL", raising=False)
    monkeypatch.delenv("MEILISEARCH_SEARCH_KEY", raising=False)
    monkeypatch.delenv("MEILISEARCH_API_KEY", raising=False)
    monkeypatch.delenv("MEILISEARCH_ADMIN_KEY", raising=False)
    monkeypatch.delenv("MEILI_MASTER_KEY", raising=False)

    response = await authenticated_client.get(
        "/api/search/autocomplete", params={"q": "vat"}
    )

    assert response.status_code == 503
    payload = response.json()
    assert "not configured" in payload["detail"].lower()


async def test_autocomplete_returns_hits_from_search_service(
    authenticated_client,
):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def autocomplete(
            self, query: str, limit: int = 10, filters: str | None = None
        ) -> dict[str, Any]:
            assert query == "contract"
            assert limit == 5
            assert filters == "jurisdiction = 'PL'"
            return {
                "hits": [
                    {
                        "id": "doc-1",
                        "title": "Contract law overview",
                        "case_number": "II CSK 123/25",
                        "jurisdiction": "PL",
                        "court_name": "Supreme Court",
                        "decision_date": "2025-06-01",
                        "_formatted": {
                            "title": "<mark>Contract</mark> law overview",
                            "summary": "A case about <mark>contract</mark> disputes",
                            "case_number": "II CSK 123/25",
                            "court_name": "Supreme Court",
                        },
                    }
                ],
                "query": query,
                "processingTimeMs": 7,
                "estimatedTotalHits": 1,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/autocomplete",
        params={"q": "contract", "limit": 5, "filters": "jurisdiction = 'PL'"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "contract"
    assert payload["processingTimeMs"] == 7
    assert payload["estimatedTotalHits"] == 1
    assert len(payload["hits"]) == 1
    assert payload["hits"][0]["id"] == "doc-1"
    assert payload["hits"][0]["case_number"] == "II CSK 123/25"


async def test_autocomplete_returns_502_when_search_backend_fails(
    authenticated_client,
):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def autocomplete(
            self, query: str, limit: int = 10, filters: str | None = None
        ) -> dict[str, Any]:
            raise RuntimeError("upstream timeout")

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/autocomplete", params={"q": "tax"}
    )

    assert response.status_code == 502
    payload = response.json()
    assert "autocomplete service error" in payload["detail"].lower()


async def test_autocomplete_analytics_includes_topic_hits_count(
    authenticated_client,
):
    """Background task is scheduled with topic_hits_count == number of topic hits."""
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def autocomplete(
            self, query: str, limit: int = 10, filters: str | None = None
        ) -> dict[str, Any]:
            return {
                "hits": [
                    {"id": "doc-1", "title": "Drug offence ruling"},
                    {"id": "doc-2", "title": "Another ruling"},
                ],
                "topic_hits": [
                    {
                        "id": "drug_trafficking",
                        "label_pl": "Handel narkotykami",
                        "label_en": "Drug trafficking",
                        "doc_count": 247,
                        "category": "drug_offences",
                        "jurisdictions": ["pl", "uk"],
                    },
                    {
                        "id": "drug_possession",
                        "label_pl": "Posiadanie narkotyków",
                        "label_en": "Drug possession",
                        "doc_count": 180,
                        "category": "drug_offences",
                        "jurisdictions": ["pl"],
                    },
                ],
                "query": query,
                "processingTimeMs": 9,
                "estimatedTotalHits": 2,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    with patch("app.api.search.record_search_query") as mock_record:
        response = await authenticated_client.get(
            "/api/search/autocomplete", params={"q": "narko"}
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["topic_hits"]) == 2

    # Background task must have been registered with topic_hits_count=2
    mock_record.assert_called_once_with(
        query="narko",
        hit_count=2,
        processing_ms=9,
        filters=None,
        topic_hits_count=2,
    )


async def test_autocomplete_analytics_zero_topic_hits(
    authenticated_client,
):
    """topic_hits_count is 0 when the topics index returns nothing."""
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def autocomplete(
            self, query: str, limit: int = 10, filters: str | None = None
        ) -> dict[str, Any]:
            return {
                "hits": [{"id": "doc-1", "title": "Tax ruling"}],
                "topic_hits": [],
                "query": query,
                "processingTimeMs": 5,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    with patch("app.api.search.record_search_query") as mock_record:
        response = await authenticated_client.get(
            "/api/search/autocomplete", params={"q": "vat"}
        )

    assert response.status_code == 200
    mock_record.assert_called_once_with(
        query="vat",
        hit_count=1,
        processing_ms=5,
        filters=None,
        topic_hits_count=0,
    )

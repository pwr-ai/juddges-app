"""Integration tests for Meilisearch-backed autocomplete endpoint."""

from typing import Any

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


async def test_autocomplete_returns_topic_hits_from_search_service(
    authenticated_client,
):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def autocomplete(
            self, query: str, limit: int = 10, filters: str | None = None
        ) -> dict[str, Any]:
            assert query == "kred"
            assert limit == 5
            assert filters == "jurisdiction = 'PL'"
            return {
                "hits": [
                    {
                        "value": "Kredyty frankowe",
                        "count": 142,
                        "sources": ["legal_topics", "keywords"],
                    },
                    {
                        "value": "Kredyt mieszkaniowy",
                        "count": 37,
                        "sources": ["keywords"],
                    },
                ],
                "query": query,
                "processingTimeMs": 4,
                "estimatedTotalHits": 2,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/autocomplete",
        params={"q": "kred", "limit": 5, "filters": "jurisdiction = 'PL'"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "kred"
    assert payload["processingTimeMs"] == 4
    assert payload["estimatedTotalHits"] == 2
    assert len(payload["hits"]) == 2
    assert payload["hits"][0]["value"] == "Kredyty frankowe"
    assert payload["hits"][0]["count"] == 142
    assert payload["hits"][0]["sources"] == ["legal_topics", "keywords"]


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

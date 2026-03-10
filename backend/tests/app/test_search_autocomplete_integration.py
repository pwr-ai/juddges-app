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

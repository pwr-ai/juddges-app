"""Integration tests for the Meilisearch-backed /api/search/documents endpoint."""

from typing import Any

import pytest

from app.server import app


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


async def test_documents_search_returns_503_when_meilisearch_not_configured(
    authenticated_client,
    monkeypatch,
):
    for env in (
        "MEILISEARCH_URL",
        "MEILISEARCH_INTERNAL_URL",
        "MEILISEARCH_SEARCH_KEY",
        "MEILISEARCH_API_KEY",
        "MEILISEARCH_ADMIN_KEY",
        "MEILI_MASTER_KEY",
    ):
        monkeypatch.delenv(env, raising=False)

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "vat"}
    )

    assert response.status_code == 503
    assert "not configured" in response.json()["detail"].lower()


async def test_documents_search_returns_pagination_metadata(authenticated_client):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def documents_search(
            self,
            query: str,
            limit: int = 10,
            offset: int = 0,
            filters: str | None = None,
        ) -> dict[str, Any]:
            assert query == "appeal"
            assert limit == 5
            assert offset == 0
            assert filters == "base_num_victims >= 1"
            return {
                "hits": [
                    {"id": f"doc-{i}", "title": f"Doc {i}", "jurisdiction": "UK"}
                    for i in range(5)
                ],
                "query": query,
                "processingTimeMs": 12,
                "estimatedTotalHits": 42,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/documents",
        params={
            "q": "appeal",
            "limit": 5,
            "offset": 0,
            "filters": "base_num_victims >= 1",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["documents"]) == 5
    assert payload["query_time_ms"] == 12
    assert payload["total_count"] == 42
    pagination = payload["pagination"]
    assert pagination["offset"] == 0
    assert pagination["limit"] == 5
    assert pagination["loaded_count"] == 5
    assert pagination["estimated_total"] == 42
    assert pagination["has_more"] is True
    assert pagination["next_offset"] == 5


async def test_documents_search_signals_no_more_pages(authenticated_client):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def documents_search(
            self,
            query: str,
            limit: int = 10,
            offset: int = 0,
            filters: str | None = None,
        ) -> dict[str, Any]:
            return {
                "hits": [{"id": "doc-1"}],
                "query": query,
                "processingTimeMs": 3,
                "estimatedTotalHits": 1,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "appeal"}
    )

    payload = response.json()
    pagination = payload["pagination"]
    assert pagination["has_more"] is False
    assert pagination["next_offset"] is None


async def test_documents_search_returns_502_on_backend_failure(authenticated_client):
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def documents_search(
            self,
            query: str,
            limit: int = 10,
            offset: int = 0,
            filters: str | None = None,
        ) -> dict[str, Any]:
            raise RuntimeError("upstream timeout")

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get(
        "/api/search/documents", params={"q": "appeal"}
    )

    assert response.status_code == 502
    assert "upstream timeout" in response.json()["detail"]


async def test_documents_search_accepts_empty_query(authenticated_client):
    """Match-all (no `q`) should be allowed for browse-by-filter use cases."""
    from app.api.search import get_search_service

    class FakeSearchService:
        configured = True

        async def documents_search(
            self,
            query: str,
            limit: int = 10,
            offset: int = 0,
            filters: str | None = None,
        ) -> dict[str, Any]:
            assert query == ""
            return {
                "hits": [{"id": "doc-1"}],
                "query": "",
                "processingTimeMs": 1,
                "estimatedTotalHits": 100,
            }

    app.dependency_overrides[get_search_service] = lambda: FakeSearchService()

    response = await authenticated_client.get("/api/search/documents", params={"q": ""})

    assert response.status_code == 200
    assert response.json()["pagination"]["estimated_total"] == 100

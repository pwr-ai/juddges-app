"""Tests for the corpus-suggestion endpoint and service (issue #153).

Covers:
- API response shape (SuggestResponse) when the suggestions index has data.
- Empty / disabled fallback path (HTTP 200 with empty list, never an error).
- language / category validation.
- MeiliSearchService.suggest() degrades silently when the index is unavailable.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

pytestmark = pytest.mark.unit


# ── SuggestResponse / SuggestionHit models ───────────────────────────────────


class TestSuggestionModels:
    def test_suggestion_hit_accepts_formatted_alias(self):
        from app.services.search import SuggestionHit

        hit = SuggestionHit.model_validate(
            {
                "id": "phrase:pl:razace_naruszenie_prawa",
                "term": "rażące naruszenie prawa",
                "language": "pl",
                "category": "phrase",
                "weight": 120,
                "_formatted": {"term": "<mark>rażące</mark> naruszenie prawa"},
            }
        )
        assert hit.language == "pl"
        assert hit.weight == 120
        assert hit.formatted is not None


# ── GET /api/search/suggest endpoint ─────────────────────────────────────────


class TestSuggestEndpoint:
    @pytest.mark.anyio
    async def test_returns_suggestion_hits_shape(self, client, valid_api_headers):
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.suggest = AsyncMock(
            return_value={
                "suggestion_hits": [
                    {
                        "id": "legal_topic:pl:przestepstwa_narkotykowe",
                        "term": "przestępstwa narkotykowe",
                        "language": "pl",
                        "category": "legal_topic",
                        "weight": 412,
                    }
                ],
                "query": "przest",
                "processingTimeMs": 3,
                "estimatedTotalHits": 1,
            }
        )
        app.dependency_overrides[get_search_service] = lambda: mock_service
        try:
            response = await client.get(
                "/api/search/suggest?q=przest", headers=valid_api_headers
            )
        finally:
            app.dependency_overrides.pop(get_search_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "przest"
        assert len(data["suggestion_hits"]) == 1
        hit = data["suggestion_hits"][0]
        assert hit["term"] == "przestępstwa narkotykowe"
        assert hit["language"] == "pl"
        assert hit["category"] == "legal_topic"
        assert hit["weight"] == 412

    @pytest.mark.anyio
    async def test_passes_language_and_category_filters(
        self, client, valid_api_headers
    ):
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.suggest = AsyncMock(
            return_value={
                "suggestion_hits": [],
                "query": "fra",
                "processingTimeMs": 1,
                "estimatedTotalHits": 0,
            }
        )
        app.dependency_overrides[get_search_service] = lambda: mock_service
        try:
            response = await client.get(
                "/api/search/suggest?q=fra&language=en&category=keyword&limit=5",
                headers=valid_api_headers,
            )
        finally:
            app.dependency_overrides.pop(get_search_service, None)

        assert response.status_code == 200
        mock_service.suggest.assert_awaited_once()
        _, kwargs = mock_service.suggest.call_args
        assert kwargs["language"] == "en"
        assert kwargs["category"] == "keyword"
        assert kwargs["limit"] == 5

    @pytest.mark.anyio
    async def test_empty_fallback_when_not_configured(self, client, valid_api_headers):
        """When Meilisearch is not configured, return 200 with an empty list."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = False
        app.dependency_overrides[get_search_service] = lambda: mock_service
        try:
            response = await client.get(
                "/api/search/suggest?q=anything", headers=valid_api_headers
            )
        finally:
            app.dependency_overrides.pop(get_search_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["suggestion_hits"] == []
        assert data["query"] == "anything"

    @pytest.mark.anyio
    async def test_service_error_falls_back_to_empty(self, client, valid_api_headers):
        """An exception inside suggest() degrades to an empty 200 response."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.suggest = AsyncMock(side_effect=RuntimeError("meili down"))
        app.dependency_overrides[get_search_service] = lambda: mock_service
        try:
            response = await client.get(
                "/api/search/suggest?q=boom", headers=valid_api_headers
            )
        finally:
            app.dependency_overrides.pop(get_search_service, None)

        assert response.status_code == 200
        assert response.json()["suggestion_hits"] == []

    @pytest.mark.anyio
    async def test_rejects_invalid_language(self, client, valid_api_headers):
        response = await client.get(
            "/api/search/suggest?q=test&language=de", headers=valid_api_headers
        )
        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_rejects_invalid_category(self, client, valid_api_headers):
        response = await client.get(
            "/api/search/suggest?q=test&category=bogus", headers=valid_api_headers
        )
        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_requires_query(self, client, valid_api_headers):
        response = await client.get("/api/search/suggest", headers=valid_api_headers)
        assert response.status_code == 422  # missing required q

    @pytest.mark.anyio
    async def test_requires_api_key(self, client):
        """The suggest endpoint is API-key protected like the rest of /search."""
        response = await client.get("/api/search/suggest?q=fraud")
        assert response.status_code == 401


# ── MeiliSearchService.suggest() unit tests ──────────────────────────────────


class TestSuggestService:
    @pytest.fixture
    def service(self):
        from app.services.search import MeiliSearchService

        return MeiliSearchService(
            base_url="http://meili:7700",
            api_key="search-key",
            admin_key="admin-key",
            index_name="judgments",
        )

    def _mock_suggestions_svc(self, service):
        from app.services.search import MeiliSearchService

        svc = MeiliSearchService(
            base_url="http://meili:7700",
            api_key="search-key",
            admin_key="admin-key",
            index_name="suggestions",
        )
        service._suggestions_service_instance = svc
        return svc

    @pytest.mark.anyio
    async def test_short_query_returns_empty_without_network(self, service):
        self._mock_suggestions_svc(service)
        result = await service.suggest("a")
        assert result["suggestion_hits"] == []

    @pytest.mark.anyio
    async def test_returns_hits_with_filter(self, service):
        self._mock_suggestions_svc(service)
        search_resp = httpx.Response(
            200,
            json={
                "hits": [
                    {
                        "id": "keyword:en:fraud",
                        "term": "fraud",
                        "language": "en",
                        "category": "keyword",
                        "weight": 99,
                    }
                ],
                "query": "fra",
                "processingTimeMs": 2,
                "estimatedTotalHits": 1,
            },
            request=httpx.Request("POST", "http://test"),
        )
        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=search_resp)
            mock_cls.return_value = mock_client

            result = await service.suggest("fra", language="en", category="keyword")

        assert len(result["suggestion_hits"]) == 1
        # Filter clause was sent.
        _, kwargs = mock_client.post.call_args
        sent = kwargs["json"]
        assert sent["filter"] == 'language = "en" AND category = "keyword"'

    @pytest.mark.anyio
    async def test_unavailable_index_returns_empty(self, service):
        self._mock_suggestions_svc(service)
        with patch("httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(
                side_effect=httpx.ConnectError("connection refused")
            )
            mock_cls.return_value = mock_client

            result = await service.suggest("fraud")

        assert result["suggestion_hits"] == []

    @pytest.mark.anyio
    async def test_unconfigured_suggestions_service_returns_empty(self, service):
        from app.services.search import MeiliSearchService

        service._suggestions_service_instance = MeiliSearchService(
            base_url=None, api_key=None, index_name="suggestions"
        )
        result = await service.suggest("fraud")
        assert result["suggestion_hits"] == []

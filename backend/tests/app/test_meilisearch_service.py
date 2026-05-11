"""Unit tests for MeiliSearchService admin methods (mocked httpx)."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.search import (
    MeiliSearchService,
    SearchServiceError,
    _normalize_meilisearch_url_for_runtime,
)


def _mock_response(status_code: int, json_data: dict) -> httpx.Response:
    """Create an httpx.Response with a request attached (required for raise_for_status)."""
    return httpx.Response(
        status_code,
        json=json_data,
        request=httpx.Request("GET", "http://test"),
    )


@pytest.fixture
def service():
    return MeiliSearchService(
        base_url="http://meili:7700",
        api_key="search-key",
        admin_key="admin-key",
        index_name="judgments",
        timeout_seconds=2.0,
    )


@pytest.fixture
def search_only_service():
    """Service without admin key."""
    return MeiliSearchService(
        base_url="http://meili:7700",
        api_key="search-key",
        admin_key=None,
        index_name="judgments",
    )


class TestConfiguredProperties:
    def test_configured_true(self, service):
        assert service.configured is True

    def test_configured_false_no_url(self):
        svc = MeiliSearchService(base_url=None, api_key="key", index_name="idx")
        assert svc.configured is False

    def test_admin_configured_true(self, service):
        assert service.admin_configured is True

    def test_admin_configured_false(self, search_only_service):
        assert search_only_service.admin_configured is False

    def test_from_env_uses_master_key_fallback(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meili:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "master-key")
        monkeypatch.delenv("MEILISEARCH_SEARCH_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_API_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_ADMIN_KEY", raising=False)
        monkeypatch.setenv("MEILISEARCH_INDEX_NAME", "judgments")

        svc = MeiliSearchService.from_env()
        assert svc.configured is True
        assert svc.admin_configured is True

    def test_normalize_url_rewrites_localhost_in_docker(self, monkeypatch):
        monkeypatch.setattr("app.services.search.Path.exists", lambda _: True)
        normalized = _normalize_meilisearch_url_for_runtime("http://localhost:7700")
        assert normalized == "http://meilisearch-dev:7700"

    def test_normalize_url_keeps_remote_host_in_docker(self, monkeypatch):
        monkeypatch.setattr("app.services.search.Path.exists", lambda _: True)
        normalized = _normalize_meilisearch_url_for_runtime(
            "https://search.example.com"
        )
        assert normalized == "https://search.example.com"


class TestAutocomplete:
    @pytest.mark.asyncio
    async def test_autocomplete_issues_facet_search_per_facet(self, service):
        """Autocomplete fans out to one facet-search request per configured facet."""
        calls: list[tuple[str, dict]] = []

        async def fake_post(self_, url, json, headers):
            calls.append((url, json))
            return _mock_response(
                200,
                {
                    "facetHits": [
                        {"value": "Contract law", "count": 5},
                    ],
                    "processingTimeMs": 2,
                },
            )

        with patch("httpx.AsyncClient.post", new=fake_post):
            result = await service.autocomplete("contract", limit=5)

        assert {url for url, _ in calls} == {
            "http://meili:7700/indexes/judgments/facet-search"
        }
        facets_called = {payload["facetName"] for _, payload in calls}
        assert facets_called == set(service.AUTOCOMPLETE_FACETS)
        for _, payload in calls:
            assert payload["facetQuery"] == "contract"
        assert result["query"] == "contract"
        # 3 facets each returned the same value — merged to one hit summing counts
        assert len(result["hits"]) == 1
        assert result["hits"][0]["value"] == "Contract law"
        assert result["hits"][0]["count"] == 15
        assert set(result["hits"][0]["sources"]) == set(service.AUTOCOMPLETE_FACETS)

    @pytest.mark.asyncio
    async def test_autocomplete_raises_when_not_configured(self):
        svc = MeiliSearchService(base_url=None, api_key=None, index_name="idx")
        with pytest.raises(SearchServiceError, match="not configured"):
            await svc.autocomplete("test")

    @pytest.mark.asyncio
    async def test_autocomplete_forwards_filters_to_each_facet(self, service):
        calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            return _mock_response(200, {"facetHits": [], "processingTimeMs": 1})

        with patch("httpx.AsyncClient.post", new=fake_post):
            await service.autocomplete("test", filters="jurisdiction = 'PL'")

        assert len(calls) == len(service.AUTOCOMPLETE_FACETS)
        for payload in calls:
            assert payload["filter"] == "jurisdiction = 'PL'"

    @pytest.mark.asyncio
    async def test_autocomplete_skips_failed_facets(self, service):
        """A single facet failing must not abort the whole autocomplete."""

        async def fake_post(self_, url, json, headers):
            if json.get("facetName") == "keywords":
                return _mock_response(
                    400, {"message": "attribute not filterable: keywords"}
                )
            return _mock_response(
                200,
                {
                    "facetHits": [{"value": "Topic A", "count": 3}],
                    "processingTimeMs": 1,
                },
            )

        with patch("httpx.AsyncClient.post", new=fake_post):
            result = await service.autocomplete("topic", limit=5)

        # 2 facets succeeded, 1 failed — merged value still surfaces
        assert result["hits"][0]["value"] == "Topic A"
        assert "keywords" not in result["hits"][0]["sources"]


class TestAdminMethods:
    @pytest.mark.asyncio
    async def test_create_index(self, service):
        mock_resp = _mock_response(202, {"taskUid": 1, "status": "enqueued"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await service.create_index()

        assert result["taskUid"] == 1

    @pytest.mark.asyncio
    async def test_create_index_raises_without_admin_key(self, search_only_service):
        with pytest.raises(SearchServiceError, match="admin key"):
            await search_only_service.create_index()

    @pytest.mark.asyncio
    async def test_configure_index(self, service):
        mock_resp = _mock_response(202, {"taskUid": 2})

        with patch("httpx.AsyncClient.patch", new_callable=AsyncMock) as mock_patch:
            mock_patch.return_value = mock_resp
            result = await service.configure_index({"searchableAttributes": ["title"]})

        assert result["taskUid"] == 2

    @pytest.mark.asyncio
    async def test_upsert_documents(self, service):
        mock_resp = _mock_response(202, {"taskUid": 3})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await service.upsert_documents([{"id": "1", "title": "Doc"}])

        assert result["taskUid"] == 3

    @pytest.mark.asyncio
    async def test_delete_document(self, service):
        mock_resp = _mock_response(202, {"taskUid": 4})

        with patch("httpx.AsyncClient.delete", new_callable=AsyncMock) as mock_del:
            mock_del.return_value = mock_resp
            result = await service.delete_document("doc-1")

        assert result["taskUid"] == 4

    @pytest.mark.asyncio
    async def test_get_task(self, service):
        mock_resp = _mock_response(200, {"uid": 5, "status": "succeeded"})

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.get_task(5)

        assert result["status"] == "succeeded"

    @pytest.mark.asyncio
    async def test_wait_for_task_succeeds(self, service):
        responses = [
            _mock_response(200, {"uid": 6, "status": "processing"}),
            _mock_response(200, {"uid": 6, "status": "succeeded"}),
        ]

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = responses
            result = await service.wait_for_task(6, poll_interval=0.01, max_wait=1.0)

        assert result["status"] == "succeeded"

    @pytest.mark.asyncio
    async def test_wait_for_task_timeout(self, service):
        mock_resp = _mock_response(200, {"uid": 7, "status": "processing"})

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            with pytest.raises(SearchServiceError, match="did not complete"):
                await service.wait_for_task(7, poll_interval=0.01, max_wait=0.03)

    @pytest.mark.asyncio
    async def test_health(self, service):
        mock_resp = _mock_response(200, {"status": "available"})

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.health()

        assert result["status"] == "available"

    @pytest.mark.asyncio
    async def test_get_index_stats(self, service):
        mock_resp = _mock_response(200, {"numberOfDocuments": 42, "isIndexing": False})

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.get_index_stats()

        assert result["numberOfDocuments"] == 42


class TestDocumentsSearch:
    @pytest.mark.asyncio
    async def test_documents_search_pure_keyword(self, service):
        captured = {}

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(
                200, {"hits": [{"id": "doc-1"}], "estimatedTotalHits": 1}
            )

        with patch("httpx.AsyncClient.post", new=fake_post):
            result = await service.documents_search("drugs", limit=5, offset=0)

        assert captured["payload"]["q"] == "drugs"
        assert "hybrid" not in captured["payload"]
        assert "vector" not in captured["payload"]
        assert "full_text" in captured["payload"]["attributesToSearchOn"]
        assert result["hits"][0]["id"] == "doc-1"

    @pytest.mark.asyncio
    async def test_documents_search_hybrid_includes_vector(self, service):
        captured = {}
        fake_vec = [0.1] * 1024

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(200, {"hits": [], "estimatedTotalHits": 0})

        with (
            patch("app.services.search.embed_texts", return_value=fake_vec),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            await service.documents_search("drugs", semantic_ratio=0.5)

        assert captured["payload"]["hybrid"] == {
            "embedder": "bge-m3",
            "semanticRatio": 0.5,
        }
        assert captured["payload"]["vector"] == fake_vec

    @pytest.mark.asyncio
    async def test_hybrid_400_falls_back_to_keyword_retry(self, service):
        """When Meili 400s on a hybrid request (missing embedder, etc.),
        retry once with the hybrid/vector keys stripped instead of erroring out."""
        calls: list[dict] = []
        fake_vec = [0.2] * 1024

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            if "hybrid" in json:
                return _mock_response(
                    400,
                    {
                        "message": "Cannot find embedder with name `bge-m3`.",
                        "code": "invalid_search_embedder",
                    },
                )
            return _mock_response(
                200,
                {"hits": [{"id": "doc-after-retry"}], "estimatedTotalHits": 1},
            )

        with (
            patch("app.services.search.embed_texts", return_value=fake_vec),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            result = await service.documents_search("drugs", semantic_ratio=0.5)

        assert len(calls) == 2
        assert "hybrid" in calls[0] and "vector" in calls[0]
        assert "hybrid" not in calls[1] and "vector" not in calls[1]
        assert result["hits"][0]["id"] == "doc-after-retry"

    @pytest.mark.asyncio
    async def test_keyword_400_does_not_retry(self, service):
        """A 400 on a pure-keyword request has no hybrid to strip — surface it."""
        calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            return _mock_response(
                400, {"message": "Invalid filter syntax", "code": "invalid_filter"}
            )

        with (
            patch("httpx.AsyncClient.post", new=fake_post),
            pytest.raises(SearchServiceError),
        ):
            await service.documents_search("drugs", filters="bogus :: filter")

        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_hybrid_500_does_not_retry(self, service):
        """Server errors signal a Meili outage the keyword path can't paper over."""
        calls: list[dict] = []
        fake_vec = [0.3] * 1024

        async def fake_post(self_, url, json, headers):
            calls.append(json)
            return _mock_response(503, {"message": "Service Unavailable"})

        with (
            patch("app.services.search.embed_texts", return_value=fake_vec),
            patch("httpx.AsyncClient.post", new=fake_post),
            pytest.raises(SearchServiceError),
        ):
            await service.documents_search("drugs", semantic_ratio=0.5)

        assert len(calls) == 1

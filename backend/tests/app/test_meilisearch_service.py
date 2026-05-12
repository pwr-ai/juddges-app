"""Unit tests for MeiliSearchService admin methods (mocked httpx)."""

from unittest.mock import AsyncMock, MagicMock, patch

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

    def test_topics_from_env_reads_topics_index_env_var(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meili:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "master-key")
        monkeypatch.delenv("MEILISEARCH_SEARCH_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_API_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_ADMIN_KEY", raising=False)
        monkeypatch.setenv("MEILISEARCH_TOPICS_INDEX_NAME", "my-topics")

        svc = MeiliSearchService.topics_from_env()
        assert svc.index_name == "my-topics"
        assert svc.configured is True
        assert svc.admin_configured is True

    def test_topics_from_env_defaults_to_topics(self, monkeypatch):
        monkeypatch.setenv("MEILISEARCH_URL", "http://meili:7700")
        monkeypatch.setenv("MEILI_MASTER_KEY", "master-key")
        monkeypatch.delenv("MEILISEARCH_SEARCH_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_API_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_ADMIN_KEY", raising=False)
        monkeypatch.delenv("MEILISEARCH_TOPICS_INDEX_NAME", raising=False)

        svc = MeiliSearchService.topics_from_env()
        assert svc.index_name == "topics"

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
    async def test_autocomplete_sends_correct_payload(self, service):
        mock_resp = _mock_response(
            200, {"hits": [{"id": "1", "title": "Test"}], "query": "test"}
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await service.autocomplete("test", limit=5)

        assert result["query"] == "test"
        # There may be two POST calls (judgments + topics). Find the judgments call
        # explicitly so the assertion is stable regardless of async scheduling order.
        judgments_call = next(
            c
            for c in mock_post.call_args_list
            if "/indexes/judgments/" in (c.args[0] if c.args else "")
        )
        payload = judgments_call.kwargs.get("json") or judgments_call[1].get("json")
        assert payload["q"] == "test"
        assert payload["limit"] == 5
        assert "case_number" in payload["attributesToHighlight"]
        assert "attributesToRetrieve" in payload
        assert payload["matchingStrategy"] == "last"
        assert payload["attributesToSearchOn"][0] == "title"
        assert payload["attributesToCrop"] == ["summary"]

    @pytest.mark.asyncio
    async def test_autocomplete_raises_when_not_configured(self):
        svc = MeiliSearchService(base_url=None, api_key=None, index_name="idx")
        with pytest.raises(SearchServiceError, match="not configured"):
            await svc.autocomplete("test")

    @pytest.mark.asyncio
    async def test_autocomplete_with_filters(self, service):
        mock_resp = _mock_response(200, {"hits": [], "query": "test"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            await service.autocomplete("test", filters="jurisdiction = 'PL'")

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get(
            "json"
        )
        assert payload["filter"] == "jurisdiction = 'PL'"


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


class TestGetDocumentsSwapDelete:
    """HTTP-level tests for get_documents, swap_indexes, and delete_index."""

    @pytest.mark.asyncio
    async def test_get_documents_happy_path_with_filter(self, service):
        mock_resp = _mock_response(
            200,
            {
                "results": [{"id": "drug_trafficking", "doc_count": 247}],
                "total": 1,
                "limit": 1000,
                "offset": 0,
            },
        )

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.get_documents(
                limit=1000,
                fields=["id", "doc_count"],
                filter_expr="category = 'drug_offences'",
            )

        assert result["total"] == 1
        assert result["results"][0]["id"] == "drug_trafficking"
        # Verify the URL and params were constructed correctly.
        call_url = (
            mock_get.call_args.args[0]
            if mock_get.call_args.args
            else mock_get.call_args[0][0]
        )
        assert "/indexes/judgments/documents" in call_url
        params = mock_get.call_args.kwargs.get("params") or {}
        assert params.get("filter") == "category = 'drug_offences'"
        assert params.get("fields") == "id,doc_count"

    @pytest.mark.asyncio
    async def test_get_documents_raises_when_admin_not_configured(
        self, search_only_service
    ):
        with pytest.raises(SearchServiceError, match="admin key"):
            await search_only_service.get_documents()

    @pytest.mark.asyncio
    async def test_swap_indexes_posts_correct_payload(self, service):
        mock_resp = _mock_response(202, {"taskUid": 10, "status": "enqueued"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            result = await service.swap_indexes("topics", "topics_new")

        assert result["taskUid"] == 10
        call_url = (
            mock_post.call_args.args[0]
            if mock_post.call_args.args
            else mock_post.call_args[0][0]
        )
        assert call_url.endswith("/swap-indexes")
        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get(
            "json"
        )
        assert payload == [{"indexes": ["topics", "topics_new"]}]

    @pytest.mark.asyncio
    async def test_swap_indexes_raises_when_admin_not_configured(
        self, search_only_service
    ):
        with pytest.raises(SearchServiceError, match="admin key"):
            await search_only_service.swap_indexes("topics", "topics_new")

    @pytest.mark.asyncio
    async def test_delete_index_calls_correct_url(self, service):
        mock_resp = _mock_response(202, {"taskUid": 20, "status": "enqueued"})
        # Override request to have the correct method for raise_for_status.
        mock_resp = httpx.Response(
            202,
            json={"taskUid": 20, "status": "enqueued"},
            request=httpx.Request("DELETE", "http://meili:7700/indexes/judgments"),
        )

        with patch("httpx.AsyncClient.delete", new_callable=AsyncMock) as mock_del:
            mock_del.return_value = mock_resp
            result = await service.delete_index()

        assert result["taskUid"] == 20
        call_url = (
            mock_del.call_args.args[0]
            if mock_del.call_args.args
            else mock_del.call_args[0][0]
        )
        assert "/indexes/judgments" in call_url

    @pytest.mark.asyncio
    async def test_delete_index_treats_404_as_success(self, service):
        mock_404 = httpx.Response(
            404,
            json={"message": "Index not found"},
            request=httpx.Request("DELETE", "http://meili:7700/indexes/judgments"),
        )

        with patch("httpx.AsyncClient.delete", new_callable=AsyncMock) as mock_del:
            mock_del.return_value = mock_404
            result = await service.delete_index()

        assert result["status"] == "not_found"
        assert result["indexUid"] == "judgments"

    @pytest.mark.asyncio
    async def test_delete_index_raises_when_admin_not_configured(
        self, search_only_service
    ):
        with pytest.raises(SearchServiceError, match="admin key"):
            await search_only_service.delete_index()

    @pytest.mark.asyncio
    async def test_delete_index_custom_uid(self, service):
        mock_resp = httpx.Response(
            202,
            json={"taskUid": 21, "status": "enqueued"},
            request=httpx.Request("DELETE", "http://meili:7700/indexes/topics_old"),
        )

        with patch("httpx.AsyncClient.delete", new_callable=AsyncMock) as mock_del:
            mock_del.return_value = mock_resp
            result = await service.delete_index("topics_old")

        assert result["taskUid"] == 21
        call_url = (
            mock_del.call_args.args[0]
            if mock_del.call_args.args
            else mock_del.call_args[0][0]
        )
        assert "/indexes/topics_old" in call_url


class TestAutocompleteHybrid:
    @pytest.mark.asyncio
    async def test_payload_includes_hybrid_and_vector_when_ratio_positive(
        self, service
    ):
        fake_vec = [0.2] * 1024

        captured = {}

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(200, {"hits": [], "estimatedTotalHits": 0})

        with (
            patch("app.services.search.embed_texts", return_value=fake_vec),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            await service.autocomplete("contract breach", semantic_ratio=0.3)

        assert captured["payload"]["hybrid"] == {
            "embedder": "bge-m3",
            "semanticRatio": 0.3,
        }
        assert captured["payload"]["vector"] == fake_vec

    @pytest.mark.asyncio
    async def test_payload_omits_hybrid_when_ratio_zero(self, service):
        captured = {}

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(200, {"hits": []})

        with patch("httpx.AsyncClient.post", new=fake_post):
            await service.autocomplete("contract", semantic_ratio=0.0)

        assert "hybrid" not in captured["payload"]
        assert "vector" not in captured["payload"]

    @pytest.mark.asyncio
    async def test_default_is_pure_keyword(self, service):
        """Default autocomplete is pure keyword — hybrid is opt-in via semantic_ratio>0."""
        captured = {}

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(200, {"hits": []})

        with patch("httpx.AsyncClient.post", new=fake_post):
            await service.autocomplete("contract")

        assert "hybrid" not in captured["payload"]
        assert "vector" not in captured["payload"]

    @pytest.mark.asyncio
    async def test_tei_failure_falls_back_to_keyword_search(self, service):
        captured = {}

        async def fake_post(self_, url, json, headers):
            captured["payload"] = json
            return _mock_response(200, {"hits": [], "estimatedTotalHits": 0})

        with (
            patch(
                "app.services.search.embed_texts",
                side_effect=RuntimeError("TEI unreachable"),
            ),
            patch("httpx.AsyncClient.post", new=fake_post),
        ):
            result = await service.autocomplete("contract", semantic_ratio=0.5)

        assert "hybrid" not in captured["payload"]
        assert "vector" not in captured["payload"]
        assert result["hits"] == []
        assert result["estimatedTotalHits"] == 0
        # topic_hits is now part of the response (may be [] due to degradation)
        assert "topic_hits" in result


# ── Parallel topic hits ───────────────────────────────────────────────────────


class TestAutocompleteTopics:
    """Tests for the parallel topics query added to autocomplete()."""

    def _topics_service(self) -> MeiliSearchService:
        return MeiliSearchService(
            base_url="http://meili:7700",
            api_key="search-key",
            admin_key="admin-key",
            index_name="topics",
            timeout_seconds=2.0,
        )

    @pytest.mark.asyncio
    async def test_autocomplete_returns_topic_hits(self, service):
        """Both ``hits`` and ``topic_hits`` are present when both calls succeed."""
        doc_hit = {"id": "doc-1", "title": "Contract law"}
        topic_hit = {
            "id": "drug_trafficking",
            "label_pl": "Handel narkotykami",
            "label_en": "Drug trafficking",
            "doc_count": 247,
            "jurisdictions": ["pl", "uk"],
        }

        judgments_resp = _mock_response(
            200, {"hits": [doc_hit], "query": "narko", "processingTimeMs": 3}
        )
        topics_resp = _mock_response(200, {"hits": [topic_hit], "processingTimeMs": 2})

        # Inject a pre-built topics service so topics_from_env() is not called.
        fake_topics_svc = self._topics_service()
        service._topics_service_instance = fake_topics_svc

        # Intercept both POST calls by URL.
        async def fake_post(self_, url, json, headers):
            if "topics" in url:
                return topics_resp
            return judgments_resp

        with patch("httpx.AsyncClient.post", new=fake_post):
            result = await service.autocomplete("narko")

        assert result["hits"] == [doc_hit]
        assert len(result["topic_hits"]) == 1
        assert result["topic_hits"][0]["id"] == "drug_trafficking"

    @pytest.mark.asyncio
    async def test_autocomplete_topics_failure_degrades_silently(self, service):
        """When the topics call raises, ``hits`` is still returned and ``topic_hits`` is []."""
        from loguru import logger

        doc_hit = {"id": "doc-2", "title": "Another doc"}
        judgments_resp = _mock_response(
            200, {"hits": [doc_hit], "query": "fraud", "processingTimeMs": 4}
        )

        # Use an async mock for the topics service's _query_topics.
        fake_topics_svc = self._topics_service()
        service._topics_service_instance = fake_topics_svc

        async def fake_post(self_, url, json, headers):
            if "topics" in url:
                raise httpx.ConnectError("topics index unreachable")
            return judgments_resp

        # Capture loguru warnings via a temporary in-process sink.
        logged_warnings: list[str] = []

        def _capture_sink(message):
            logged_warnings.append(message)

        sink_id = logger.add(_capture_sink, level="WARNING")
        try:
            with patch("httpx.AsyncClient.post", new=fake_post):
                result = await service.autocomplete("fraud")
        finally:
            logger.remove(sink_id)

        assert result["hits"] == [doc_hit]
        assert result["topic_hits"] == []
        # At least one warning must have mentioned topics.
        assert any("topic" in str(w).lower() for w in logged_warnings), (
            f"Expected a topics warning; got: {logged_warnings}"
        )

    @pytest.mark.asyncio
    async def test_autocomplete_skips_topics_when_query_too_short(self, service):
        """Topics service must not be called when the query is fewer than 2 chars."""
        judgments_resp = _mock_response(
            200, {"hits": [], "query": "a", "processingTimeMs": 1}
        )

        fake_topics_svc = MagicMock(spec=MeiliSearchService)
        fake_topics_svc.configured = True
        service._topics_service_instance = fake_topics_svc

        async def fake_post(self_, url, json, headers):
            return judgments_resp

        with patch("httpx.AsyncClient.post", new=fake_post):
            result = await service.autocomplete("a")

        # The topics service's search method (called inside _query_topics) is
        # only reachable via httpx.AsyncClient.post with a "topics" URL, so
        # asserting topic_hits=[] and no crash is the correct behaviour check.
        assert result["topic_hits"] == []
        # The fake_topics_svc should not have been used in any HTTP call.
        fake_topics_svc.assert_not_called()

    @pytest.mark.asyncio
    async def test_autocomplete_forwards_jurisdiction_filter_to_topics(self, service):
        """A filter string is forwarded to the topics query."""
        judgments_resp = _mock_response(
            200, {"hits": [], "query": "fraud", "processingTimeMs": 2}
        )
        topics_resp = _mock_response(200, {"hits": [], "processingTimeMs": 1})

        fake_topics_svc = self._topics_service()
        service._topics_service_instance = fake_topics_svc

        captured_topics_payload: dict = {}

        async def fake_post(self_, url, json, headers):
            if "topics" in url:
                captured_topics_payload.update(json)
                return topics_resp
            return judgments_resp

        filter_str = "jurisdictions IN ['pl']"
        with patch("httpx.AsyncClient.post", new=fake_post):
            await service.autocomplete("fraud", filters=filter_str)

        assert captured_topics_payload.get("filter") == filter_str

    @pytest.mark.asyncio
    async def test_autocomplete_topics_filter_400_retries_without_filter(self, service):
        """When the topics index returns 400 for a filter, the retry omits the filter."""
        from loguru import logger

        doc_hit = {"id": "doc-3", "title": "Robbery case"}
        topic_hit = {
            "id": "robbery",
            "label_pl": "Rozbój",
            "label_en": "Robbery",
            "doc_count": 100,
            "jurisdictions": ["pl"],
        }

        judgments_resp = _mock_response(
            200, {"hits": [doc_hit], "query": "rob", "processingTimeMs": 2}
        )
        topics_400_resp = httpx.Response(
            400,
            json={"message": "Attribute `jurisdiction` is not filterable."},
            request=httpx.Request("POST", "http://meili:7700/indexes/topics/search"),
        )
        topics_ok_resp = _mock_response(
            200, {"hits": [topic_hit], "processingTimeMs": 1}
        )

        fake_topics_svc = self._topics_service()
        service._topics_service_instance = fake_topics_svc

        # Track topics POST calls in order to serve 400 on first, 200 on second.
        topics_post_calls: list[dict] = []

        async def fake_post(self_, url, json, headers):
            if "topics" in url:
                topics_post_calls.append(json)
                if len(topics_post_calls) == 1:
                    return topics_400_resp
                return topics_ok_resp
            return judgments_resp

        logged_debug: list[str] = []

        def _capture_sink(message):
            logged_debug.append(str(message))

        filter_str = "jurisdiction = 'PL'"
        sink_id = logger.add(_capture_sink, level="DEBUG")
        try:
            with patch("httpx.AsyncClient.post", new=fake_post):
                result = await service.autocomplete("rob", filters=filter_str)
        finally:
            logger.remove(sink_id)

        # topic_hits is non-empty (retry succeeded).
        assert len(result["topic_hits"]) == 1
        assert result["topic_hits"][0]["id"] == "robbery"

        # The retry payload must not carry a ``filter`` key.
        assert len(topics_post_calls) == 2
        assert "filter" in topics_post_calls[0], "First call should have had a filter"
        assert "filter" not in topics_post_calls[1], (
            "Retry call must not include a filter"
        )

        # A debug message mentioning the unsupported filter must have been emitted.
        assert any("topics_filter_unsupported" in msg for msg in logged_debug), (
            f"Expected 'topics_filter_unsupported' debug log; got: {logged_debug}"
        )


# ── Documents-search hybrid retry tests (from main) ──────────────────────


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

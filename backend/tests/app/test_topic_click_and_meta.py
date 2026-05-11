"""Unit tests for topic-click analytics and topics/meta endpoint (Task 4)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.search_analytics import record_topic_click

# ── record_topic_click ────────────────────────────────────────────────────


class TestRecordTopicClick:
    """Tests for the fire-and-forget topic-click analytics function."""

    @patch("app.services.search_analytics.supabase_client")
    def test_inserts_row_with_correct_fields(self, mock_client):
        """record_topic_click inserts a row with topic_id, query, jurisdiction."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 1}])

        record_topic_click(
            topic_id="drug_trafficking",
            query="narko",
            user_id="user-abc",
            jurisdiction="pl",
        )

        mock_client.table.assert_called_once_with("search_topic_clicks")
        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["topic_id"] == "drug_trafficking"
        assert insert_arg["query"] == "narko"
        assert insert_arg["user_id"] == "user-abc"
        assert insert_arg["jurisdiction"] == "pl"

    @patch("app.services.search_analytics.supabase_client")
    def test_inserts_without_optional_fields(self, mock_client):
        """Omitting user_id and jurisdiction stores None for those columns."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 2}])

        record_topic_click(topic_id="homicide", query="zabójstwo")

        insert_arg = mock_table.insert.call_args[0][0]
        assert insert_arg["user_id"] is None
        assert insert_arg["jurisdiction"] is None

    @patch("app.services.search_analytics.supabase_client", None)
    def test_noop_without_supabase(self):
        """Does not raise when supabase_client is not configured."""
        record_topic_click(topic_id="fraud", query="oszustwo")

    @patch("app.services.search_analytics.supabase_client")
    def test_swallows_db_exceptions(self, mock_client):
        """Never raises even when the database insert fails."""
        mock_client.table.side_effect = RuntimeError("db down")
        record_topic_click(topic_id="fraud", query="fraud")

    @patch("app.services.search_analytics.supabase_client")
    def test_truncates_long_topic_id(self, mock_client):
        """topic_id is capped at 500 characters."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        long_id = "x" * 1000
        record_topic_click(topic_id=long_id, query="q")

        insert_arg = mock_table.insert.call_args[0][0]
        assert len(insert_arg["topic_id"]) == 500

    @patch("app.services.search_analytics.supabase_client")
    def test_truncates_long_query(self, mock_client):
        """query is capped at 500 characters."""
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.insert.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[])

        long_query = "q" * 1000
        record_topic_click(topic_id="t", query=long_query)

        insert_arg = mock_table.insert.call_args[0][0]
        assert len(insert_arg["query"]) == 500


# ── POST /api/search/topic-click endpoint ────────────────────────────────


class TestTopicClickEndpoint:
    """Tests for POST /api/search/topic-click."""

    @pytest.mark.anyio
    @patch("app.api.search.record_topic_click")
    async def test_schedules_background_task(
        self, mock_record, client, valid_api_headers
    ):
        """Endpoint returns 200 and schedules the background task with correct kwargs."""
        response = await client.post(
            "/api/search/topic-click",
            json={
                "topic_id": "drug_trafficking",
                "query": "narko",
                "jurisdiction": "pl",
            },
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        mock_record.assert_called_once_with(
            topic_id="drug_trafficking",
            query="narko",
            jurisdiction="pl",
        )

    @pytest.mark.anyio
    @patch("app.api.search.record_topic_click")
    async def test_schedules_background_task_without_jurisdiction(
        self, mock_record, client, valid_api_headers
    ):
        """When jurisdiction is omitted it reaches record_topic_click as None."""
        response = await client.post(
            "/api/search/topic-click",
            json={"topic_id": "homicide", "query": "zabójstwo"},
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        mock_record.assert_called_once_with(
            topic_id="homicide",
            query="zabójstwo",
            jurisdiction=None,
        )

    @pytest.mark.anyio
    async def test_requires_auth(self, client):
        """Endpoint rejects requests without API key (401 from APIKeyHeader)."""
        response = await client.post(
            "/api/search/topic-click",
            json={"topic_id": "fraud", "query": "fraud"},
        )
        assert response.status_code == 401

    @pytest.mark.anyio
    async def test_validates_required_fields(self, client, valid_api_headers):
        """Returns 422 when required fields are missing."""
        response = await client.post(
            "/api/search/topic-click",
            json={"topic_id": "fraud"},  # missing query
            headers=valid_api_headers,
        )
        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_jurisdiction_is_optional(self, client, valid_api_headers):
        """Endpoint accepts request without jurisdiction field."""
        response = await client.post(
            "/api/search/topic-click",
            json={"topic_id": "homicide", "query": "zabójstwo"},
            headers=valid_api_headers,
        )
        assert response.status_code == 200


# ── GET /api/search/topics/meta endpoint ─────────────────────────────────


class TestTopicsMetaEndpoint:
    """Tests for GET /api/search/topics/meta."""

    def _make_response(self, status_code: int, json_data: dict) -> httpx.Response:
        return httpx.Response(
            status_code,
            json=json_data,
            request=httpx.Request("GET", "http://test"),
        )

    @pytest.mark.anyio
    async def test_returns_correct_shape_with_data(self, client, valid_api_headers):
        """Returns TopicsMetaResponse shape when topics index has data."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.topics_stats = AsyncMock(
            return_value={
                "total_concepts": 42,
                "generated_at": "2026-05-11T10:00:00+00:00",
                "corpus_snapshot": 6000,
                "jurisdictions": ["pl", "uk"],
            }
        )
        app.dependency_overrides[get_search_service] = lambda: mock_service

        response = await client.get(
            "/api/search/topics/meta",
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_concepts"] == 42
        assert data["generated_at"] == "2026-05-11T10:00:00+00:00"
        assert data["corpus_snapshot"] == 6000
        assert data["jurisdictions"] == ["pl", "uk"]

    @pytest.mark.anyio
    async def test_returns_zeros_when_index_empty(self, client, valid_api_headers):
        """Returns total_concepts=0 and None fields when index is empty."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.topics_stats = AsyncMock(
            return_value={
                "total_concepts": 0,
                "generated_at": None,
                "corpus_snapshot": None,
                "jurisdictions": [],
            }
        )
        app.dependency_overrides[get_search_service] = lambda: mock_service

        response = await client.get(
            "/api/search/topics/meta",
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_concepts"] == 0
        assert data["generated_at"] is None
        assert data["corpus_snapshot"] is None
        assert data["jurisdictions"] == []

    @pytest.mark.anyio
    async def test_returns_zeros_when_not_configured(self, client, valid_api_headers):
        """Returns empty response when Meilisearch is not configured."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = False
        app.dependency_overrides[get_search_service] = lambda: mock_service

        response = await client.get(
            "/api/search/topics/meta",
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_concepts"] == 0
        assert data["generated_at"] is None
        assert data["corpus_snapshot"] is None
        assert data["jurisdictions"] == []

    @pytest.mark.anyio
    async def test_requires_auth(self, client):
        """Endpoint rejects requests without API key (401 from APIKeyHeader)."""
        response = await client.get("/api/search/topics/meta")
        assert response.status_code == 401

    @pytest.mark.anyio
    async def test_tolerates_missing_generated_at_and_corpus_snapshot(
        self, client, valid_api_headers
    ):
        """Fields absent from index documents are returned as None (pre-Task-7)."""
        from app.api.search import get_search_service
        from app.server import app
        from app.services.search import MeiliSearchService

        mock_service = MagicMock(spec=MeiliSearchService)
        mock_service.configured = True
        mock_service.topics_stats = AsyncMock(
            return_value={
                "total_concepts": 10,
                "generated_at": None,  # not yet written by generate_search_topics.py
                "corpus_snapshot": None,
                "jurisdictions": ["pl"],
            }
        )
        app.dependency_overrides[get_search_service] = lambda: mock_service

        response = await client.get(
            "/api/search/topics/meta",
            headers=valid_api_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_concepts"] == 10
        assert data["generated_at"] is None
        assert data["corpus_snapshot"] is None
        assert data["jurisdictions"] == ["pl"]


# ── MeiliSearchService.topics_stats unit tests ────────────────────────────


class TestTopicsStats:
    """Unit tests for MeiliSearchService.topics_stats()."""

    @pytest.fixture
    def service(self):
        from app.services.search import MeiliSearchService

        return MeiliSearchService(
            base_url="http://meili:7700",
            api_key="search-key",
            admin_key="admin-key",
            index_name="judgments",
        )

    def _mock_topics_svc(self, service):
        """Replace the lazily-cached topics service with a controlled instance."""
        from app.services.search import MeiliSearchService

        topics_svc = MeiliSearchService(
            base_url="http://meili:7700",
            api_key="search-key",
            admin_key="admin-key",
            index_name="topics",
        )
        service._topics_service_instance = topics_svc
        return topics_svc

    @pytest.mark.anyio
    async def test_returns_data_when_index_has_documents(self, service):
        """topics_stats returns counts and metadata when index is populated."""
        self._mock_topics_svc(service)

        stats_resp = httpx.Response(
            200,
            json={"numberOfDocuments": 42, "isIndexing": False},
            request=httpx.Request("GET", "http://test"),
        )
        search_resp = httpx.Response(
            200,
            json={
                "hits": [
                    {
                        "id": "drug_trafficking",
                        "label_pl": "Handel narkotykami",
                        "label_en": "Drug trafficking",
                        "doc_count": 247,
                        "jurisdictions": ["pl", "uk"],
                        "generated_at": "2026-05-11T10:00:00+00:00",
                        "corpus_snapshot": 6000,
                    }
                ]
            },
            request=httpx.Request("POST", "http://test"),
        )
        all_resp = httpx.Response(
            200,
            json={
                "hits": [
                    {"jurisdictions": ["pl", "uk"]},
                    {"jurisdictions": ["pl"]},
                ]
            },
            request=httpx.Request("POST", "http://test"),
        )

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            # Responses in order: stats GET, search POST (top doc), all POST
            mock_client.get = AsyncMock(return_value=stats_resp)
            mock_client.post = AsyncMock(side_effect=[search_resp, all_resp])
            mock_client_cls.return_value = mock_client

            result = await service.topics_stats()

        assert result["total_concepts"] == 42
        assert result["generated_at"] == "2026-05-11T10:00:00+00:00"
        assert result["corpus_snapshot"] == 6000
        assert sorted(result["jurisdictions"]) == ["pl", "uk"]

    @pytest.mark.anyio
    async def test_returns_empty_when_index_has_no_documents(self, service):
        """topics_stats returns zeros when numberOfDocuments == 0."""
        self._mock_topics_svc(service)

        stats_resp = httpx.Response(
            200,
            json={"numberOfDocuments": 0},
            request=httpx.Request("GET", "http://test"),
        )

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=stats_resp)
            mock_client_cls.return_value = mock_client

            result = await service.topics_stats()

        assert result["total_concepts"] == 0
        assert result["generated_at"] is None
        assert result["corpus_snapshot"] is None
        assert result["jurisdictions"] == []

    @pytest.mark.anyio
    async def test_returns_empty_when_topics_service_not_configured(self, service):
        """topics_stats returns empty dict when topics service has no URL."""
        from app.services.search import MeiliSearchService

        unconfigured = MeiliSearchService(
            base_url=None,
            api_key=None,
            index_name="topics",
        )
        service._topics_service_instance = unconfigured

        result = await service.topics_stats()

        assert result["total_concepts"] == 0
        assert result["generated_at"] is None

    @pytest.mark.anyio
    async def test_returns_empty_on_http_error(self, service):
        """topics_stats never raises; returns empty dict on network failure."""
        self._mock_topics_svc(service)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(
                side_effect=httpx.ConnectError("connection refused")
            )
            mock_client_cls.return_value = mock_client

            result = await service.topics_stats()

        assert result["total_concepts"] == 0
        assert result["generated_at"] is None
        assert result["jurisdictions"] == []

    @pytest.mark.anyio
    async def test_tolerates_missing_generated_at_field(self, service):
        """topics_stats returns None for generated_at when not present in docs."""
        self._mock_topics_svc(service)

        stats_resp = httpx.Response(
            200,
            json={"numberOfDocuments": 5},
            request=httpx.Request("GET", "http://test"),
        )
        search_resp = httpx.Response(
            200,
            json={
                "hits": [
                    {
                        "id": "fraud",
                        "label_pl": "Oszustwo",
                        "label_en": "Fraud",
                        "doc_count": 100,
                        "jurisdictions": ["uk"],
                        # generated_at and corpus_snapshot intentionally absent
                    }
                ]
            },
            request=httpx.Request("POST", "http://test"),
        )
        all_resp = httpx.Response(
            200,
            json={"hits": [{"jurisdictions": ["uk"]}]},
            request=httpx.Request("POST", "http://test"),
        )

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=stats_resp)
            mock_client.post = AsyncMock(side_effect=[search_resp, all_resp])
            mock_client_cls.return_value = mock_client

            result = await service.topics_stats()

        assert result["total_concepts"] == 5
        assert result["generated_at"] is None
        assert result["corpus_snapshot"] is None
        assert result["jurisdictions"] == ["uk"]

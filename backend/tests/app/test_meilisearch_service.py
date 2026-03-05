"""Unit tests for MeiliSearchService admin methods (mocked httpx)."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.search import MeiliSearchService, SearchServiceError


def _mock_response(status_code: int, json_data: dict) -> httpx.Response:
    """Create an httpx.Response with a request attached (required for raise_for_status)."""
    resp = httpx.Response(
        status_code,
        json=json_data,
        request=httpx.Request("GET", "http://test"),
    )
    return resp


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
        svc = MeiliSearchService(
            base_url=None, api_key="key", index_name="idx"
        )
        assert svc.configured is False

    def test_admin_configured_true(self, service):
        assert service.admin_configured is True

    def test_admin_configured_false(self, search_only_service):
        assert search_only_service.admin_configured is False


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
        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["q"] == "test"
        assert payload["limit"] == 5
        assert "case_number" in payload["attributesToHighlight"]
        assert "attributesToRetrieve" in payload

    @pytest.mark.asyncio
    async def test_autocomplete_raises_when_not_configured(self):
        svc = MeiliSearchService(
            base_url=None, api_key=None, index_name="idx"
        )
        with pytest.raises(SearchServiceError, match="not configured"):
            await svc.autocomplete("test")

    @pytest.mark.asyncio
    async def test_autocomplete_with_filters(self, service):
        mock_resp = _mock_response(200, {"hits": [], "query": "test"})

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            await service.autocomplete("test", filters="jurisdiction = 'PL'")

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
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
                await service.wait_for_task(
                    7, poll_interval=0.01, max_wait=0.03
                )

    @pytest.mark.asyncio
    async def test_health(self, service):
        mock_resp = _mock_response(200, {"status": "available"})

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.health()

        assert result["status"] == "available"

    @pytest.mark.asyncio
    async def test_get_index_stats(self, service):
        mock_resp = _mock_response(
            200, {"numberOfDocuments": 42, "isIndexing": False}
        )

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_resp
            result = await service.get_index_stats()

        assert result["numberOfDocuments"] == 42

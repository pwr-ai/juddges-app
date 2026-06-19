"""MeiliSearchService.facet_search HTTP contract."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.search import MeiliSearchService, SearchServiceError


def _service() -> MeiliSearchService:
    return MeiliSearchService(
        base_url="http://meili.test",
        api_key="k",
        admin_key="k",
        index_name="judgments",
        timeout_seconds=2.0,
    )


def _mock_response(status_code: int, data: dict) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    return resp


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_returns_canonical_hits():
    service = _service()
    mock_resp = _mock_response(
        200,
        {
            "facetHits": [
                {"value": "VAT", "count": 12},
                {"value": "vatovska", "count": 1},
            ]
        },
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        hits = await service.facet_search("keywords", "VAT", limit=3)

    assert hits == ["VAT", "vatovska"]
    payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get(
        "json"
    )
    assert payload == {"facetName": "keywords", "facetQuery": "VAT", "limit": 3}
    url = (
        mock_post.call_args.args[0]
        if mock_post.call_args.args
        else mock_post.call_args.kwargs["url"]
    )
    assert url.endswith("/indexes/judgments/facet-search")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_raises_on_http_error():
    service = _service()
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.ConnectError("boom")
        with pytest.raises(SearchServiceError):
            await service.facet_search("keywords", "VAT")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_facet_search_returns_empty_when_unconfigured():
    service = MeiliSearchService(
        base_url=None, api_key=None, admin_key=None, index_name="judgments"
    )
    assert await service.facet_search("keywords", "x") == []

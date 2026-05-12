"""Tests for the facets pass-through on POST /documents/search."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.server import app

if TYPE_CHECKING:
    from collections.abc import Iterator


@pytest.fixture
def client_with_api_key() -> Iterator[TestClient]:
    """Sync TestClient pre-configured with the test ``X-API-Key`` header.

    Scoped to this file (rather than the shared conftest) since the only
    consumer right now is the facets pass-through test. Mirrors the API key
    set in ``backend/tests/app/conftest.py``.
    """
    headers = {"X-API-Key": "test-api-key-12345"}
    with TestClient(app, headers=headers) as client:
        yield client


@pytest.mark.asyncio
async def test_facets_param_forwarded_to_meili(client_with_api_key: TestClient) -> None:
    """When the request body includes facets, the proxy passes them to Meili
    and returns the facetDistribution unchanged."""
    fake_response = {
        "hits": [],
        "estimatedTotalHits": 0,
        "query": "",
        "facetDistribution": {
            "base_appeal_outcome": {"dismissed": 124, "allowed": 33},
        },
    }
    with patch(
        "app.services.search.MeiliSearchService.search",
        new=AsyncMock(return_value=fake_response),
    ) as mock_search:
        resp = client_with_api_key.post(
            "/documents/search",
            json={
                "query": "",
                "facets": ["base_appeal_outcome"],
                "facet_query": "dis",
                "limit": 0,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("facetDistribution") == fake_response["facetDistribution"]
        kwargs = mock_search.await_args.kwargs
        assert kwargs.get("facets") == ["base_appeal_outcome"]
        assert kwargs.get("facet_query") == "dis"

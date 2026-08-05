"""Runtime contracts for rate-limited search and topic endpoints."""

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.unit


@pytest.mark.anyio
@patch("app.api.search.get_trending_topics")
async def test_trending_request_succeeds_with_runtime_rate_limit_headers(
    mock_trending,
    client,
    valid_api_headers,
):
    """The /topics consumer must work with production limiter settings."""
    from app.server import app

    mock_trending.return_value = []
    app.state.limiter.enabled = True
    try:
        response = await client.get(
            "/api/search/topics/trending?days=7&limit=5",
            headers=valid_api_headers,
        )
    finally:
        app.state.limiter.enabled = False

    assert response.status_code == 200
    assert int(response.headers["X-RateLimit-Limit"]) > 0


@pytest.mark.anyio
@patch("app.api.search.get_popular_queries")
async def test_popular_queries_succeeds_with_runtime_rate_limit_headers(
    mock_popular,
    client,
    valid_api_headers,
):
    from app.server import app

    mock_popular.return_value = []
    app.state.limiter.enabled = True
    try:
        response = await client.get(
            "/api/search/analytics/popular",
            headers=valid_api_headers,
        )
    finally:
        app.state.limiter.enabled = False

    assert response.status_code == 200
    assert int(response.headers["X-RateLimit-Limit"]) > 0


@pytest.mark.anyio
@patch("app.api.search.get_zero_result_queries")
async def test_zero_results_succeeds_with_runtime_rate_limit_headers(
    mock_zero_results,
    client,
    valid_api_headers,
):
    from app.server import app

    mock_zero_results.return_value = []
    app.state.limiter.enabled = True
    try:
        response = await client.get(
            "/api/search/analytics/zero-results",
            headers=valid_api_headers,
        )
    finally:
        app.state.limiter.enabled = False

    assert response.status_code == 200
    assert int(response.headers["X-RateLimit-Limit"]) > 0


@pytest.mark.anyio
@patch("app.api.search.export_eval_queries")
async def test_eval_queries_succeeds_with_runtime_rate_limit_headers(
    mock_export,
    client,
    valid_api_headers,
    monkeypatch,
):
    import app.api.search as search_mod
    from app.server import app

    monkeypatch.setattr(search_mod, "RESEARCHER_API_KEY", None)
    mock_export.return_value = {
        "queries": [],
        "metadata": {
            "exported_at": "2026-01-01T00:00:00Z",
            "days": 30,
            "min_frequency": 1,
            "total_queries": 0,
            "labeled_queries": 0,
            "unlabeled_queries": 0,
            "source_breakdown": {},
        },
    }
    app.state.limiter.enabled = True
    try:
        response = await client.get(
            "/api/search/analytics/eval-queries",
            headers=valid_api_headers,
        )
    finally:
        app.state.limiter.enabled = False

    assert response.status_code == 200
    assert int(response.headers["X-RateLimit-Limit"]) > 0

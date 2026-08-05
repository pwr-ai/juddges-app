"""Runtime contracts for topic endpoints used by the frontend topics page."""

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

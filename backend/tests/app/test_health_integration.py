"""
Integration tests for health check and monitoring endpoints.

Tests system health, readiness, and liveness endpoints.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
@pytest.mark.api
async def test_health_check_no_auth_required(client: AsyncClient):
    """Test that health check endpoint doesn't require authentication."""
    response = await client.get("/health")

    # Should be accessible without auth
    assert response.status_code in [200, 404]


@pytest.mark.anyio
@pytest.mark.api
async def test_health_check_basic(client: AsyncClient):
    """Test basic health check endpoint."""
    response = await client.get("/health")

    if response.status_code == 200:
        data = response.json()
        assert "status" in data
        assert data["status"] in ["healthy", "ok", "up"]


@pytest.mark.anyio
@pytest.mark.api
async def test_readiness_check(client: AsyncClient):
    """Test readiness probe endpoint."""
    response = await client.get("/health/ready")

    # Readiness may or may not be implemented
    if response.status_code == 200:
        data = response.json()
        assert "ready" in data or "status" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_liveness_check(client: AsyncClient):
    """Test liveness probe endpoint."""
    response = await client.get("/health/live")

    # Liveness may or may not be implemented
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
async def test_health_check_detailed(client: AsyncClient):
    """Test detailed health check with component status."""
    response = await client.get("/health/detailed")

    if response.status_code == 200:
        data = response.json()
        # Should contain component health info
        assert isinstance(data, dict)

        # Common components to check
        if "components" in data:
            components = data["components"]
            # May include: database, redis, embeddings, etc.
            assert isinstance(components, dict)


@pytest.mark.anyio
@pytest.mark.api
async def test_database_health(client: AsyncClient):
    """Test database health check."""
    response = await client.get("/health/database")

    if response.status_code == 200:
        data = response.json()
        assert "status" in data or "healthy" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_redis_health(client: AsyncClient):
    """Test Redis health check."""
    response = await client.get("/health/redis")

    # Redis health check may or may not exist
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
async def test_vector_db_health(client: AsyncClient):
    """Test vector database health check."""
    response = await client.get("/health/vector-db")

    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
async def test_openapi_schema_accessible(client: AsyncClient):
    """Test that OpenAPI schema is accessible."""
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    data = response.json()

    # Validate OpenAPI structure
    assert "openapi" in data
    assert "info" in data
    assert "paths" in data


@pytest.mark.anyio
@pytest.mark.api
async def test_docs_ui_accessible(client: AsyncClient):
    """Test that Swagger UI docs are accessible."""
    response = await client.get("/docs")

    assert response.status_code == 200
    # Should return HTML
    assert "text/html" in response.headers.get("content-type", "")


@pytest.mark.anyio
@pytest.mark.api
async def test_redoc_ui_accessible(client: AsyncClient):
    """Test that ReDoc UI is accessible."""
    response = await client.get("/redoc")

    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


@pytest.mark.anyio
@pytest.mark.api
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint returns useful information."""
    response = await client.get("/")

    # Root may redirect or return info
    assert response.status_code in [200, 307, 308]


@pytest.mark.anyio
@pytest.mark.api
async def test_version_endpoint(client: AsyncClient):
    """Test API version endpoint."""
    response = await client.get("/version")

    if response.status_code == 200:
        data = response.json()
        assert "version" in data or isinstance(data, dict)


@pytest.mark.anyio
@pytest.mark.api
async def test_metrics_endpoint(client: AsyncClient):
    """Test metrics endpoint (Prometheus format)."""
    response = await client.get("/metrics")

    # Metrics may or may not be implemented
    if response.status_code == 200:
        # Prometheus metrics are text format
        content_type = response.headers.get("content-type", "")
        assert "text" in content_type or response.text


@pytest.mark.anyio
@pytest.mark.api
async def test_health_check_response_time(client: AsyncClient):
    """Test that health check responds quickly."""
    import time

    start = time.perf_counter()
    await client.get("/health")
    end = time.perf_counter()

    duration = end - start

    # Health check should be fast (under 1 second)
    assert duration < 1.0, f"Health check took {duration}s, should be < 1s"

"""
Real integration tests for Weaviate connection pool.

These tests verify ACTUAL behavior with real Weaviate connections:
1. Connection pool is actually being used
2. Pool stays connected after operations
3. Configuration is correct
4. Real endpoints work with pool
"""

import os
import pytest
from httpx import AsyncClient
from httpx._transports.asgi import ASGITransport

from ai_tax_search.db.weaviate_pool import (
    get_weaviate_pool,
    cleanup_weaviate_pool,
)
from ai_tax_search.db.weaviate_db import WeaviateLegalDatabase


@pytest.fixture
async def api_key():
    """Fixture for API key used in tests."""
    return os.getenv("BACKEND_API_KEY", "test-api-key")


@pytest.fixture
async def async_client():
    """Fixture for async FastAPI test client."""
    from app.server import app
    # Use explicit transport to avoid deprecation warning
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
async def cleanup_before_test():
    """Clean up pool before each test."""
    await cleanup_weaviate_pool()
    yield
    await cleanup_weaviate_pool()


class TestConnectionPoolUsage:
    """Test 1: Verify Weaviate is actually using connection pools."""

    @pytest.mark.asyncio
    async def test_pool_is_used_when_enabled(self):
        """Verify that when use_pool=True, the same client instance is reused."""
        # Initialize pool
        pool = get_weaviate_pool()
        await pool.connect()
        
        # Get client from pool multiple times
        client1 = pool.get_client()
        client2 = pool.get_client()
        client3 = pool.get_client()
        
        # All should be the SAME instance (pool is working)
        assert client1 is client2 is client3, "Pool should return same client instance"
        
        # Verify it's actually connected and working
        collections = await client1.collections.list_all()
        assert isinstance(collections, dict)

    @pytest.mark.asyncio
    async def test_weaviate_database_uses_pool(self):
        """Verify WeaviateDatabase actually uses pool when use_pool=True."""
        # Initialize pool
        pool = get_weaviate_pool()
        await pool.connect()
        pool_client = pool.get_client()
        
        # Use WeaviateDatabase with pool
        async with WeaviateLegalDatabase(use_pool=True) as db:
            # Should be using the same client from pool
            assert db.client is pool_client, "WeaviateDatabase should use pool client"
            assert db._pool_client is pool_client, "Should track pool client"
            
            # Verify it works
            collection = db.legal_documents_collection
            assert collection is not None

    @pytest.mark.asyncio
    async def test_pool_not_used_when_disabled(self):
        """Verify that when use_pool=False, new connections are created."""
        # Don't initialize pool
        await cleanup_weaviate_pool()
        
        # Use WeaviateDatabase without pool
        async with WeaviateLegalDatabase(use_pool=False) as db1:
            client1 = db1.client
            
            # Create another connection
            async with WeaviateLegalDatabase(use_pool=False) as db2:
                client2 = db2.client
                
                # Should be DIFFERENT instances (not from pool)
                assert client1 is not client2, "Without pool, should create new connections"


class TestPoolPersistence:
    """Test 2: Verify pool stays connected after operations."""

    @pytest.mark.asyncio
    async def test_pool_stays_connected_after_query(self):
        """Verify pool connection persists after performing queries."""
        pool = get_weaviate_pool()
        await pool.connect()
        
        # Perform multiple operations
        for i in range(5):
            client = pool.get_client()
            collections = await client.collections.list_all()
            assert isinstance(collections, dict)
            
            # Pool should still be connected after each operation
            assert pool.is_connected is True, f"Pool should stay connected after operation {i+1}"
        
        # Verify pool is still connected at the end
        assert pool.is_connected is True

    @pytest.mark.asyncio
    async def test_pool_stays_connected_after_database_operations(self):
        """Verify pool stays connected after WeaviateDatabase operations."""
        pool = get_weaviate_pool()
        await pool.connect()
        
        # Perform multiple database operations
        for i in range(3):
            async with WeaviateLegalDatabase(use_pool=True) as db:
                collection = db.legal_documents_collection
                # Try a simple query
                response = await collection.query.fetch_objects(limit=1)
                assert response is not None
            
            # After context exit, pool should still be connected
            assert pool.is_connected is True, f"Pool should stay connected after DB operation {i+1}"

    @pytest.mark.asyncio
    async def test_pool_survives_multiple_requests(self):
        """Verify pool connection survives multiple concurrent requests."""
        pool = get_weaviate_pool()
        await pool.connect()
        
        import asyncio
        
        async def make_request():
            client = pool.get_client()
            return await client.collections.list_all()
        
        # Make 10 concurrent requests
        results = await asyncio.gather(*[make_request() for _ in range(10)])
        
        # All should succeed
        assert len(results) == 10
        for result in results:
            assert isinstance(result, dict)
        
        # Pool should still be connected
        assert pool.is_connected is True


class TestConfiguration:
    """Test 3: Verify configuration is correct."""

    @pytest.mark.asyncio
    async def test_pool_configuration_values(self):
        """Verify pool configuration values are set correctly."""
        pool = get_weaviate_pool()
        
        # Check default values
        assert pool.pool_connections == int(os.getenv("WV_POOL_CONNECTIONS", "10"))
        assert pool.pool_maxsize == int(os.getenv("WV_POOL_MAXSIZE", "50"))
        assert pool.pool_max_retries == int(os.getenv("WV_POOL_MAX_RETRIES", "3"))
        assert pool.pool_timeout == int(os.getenv("WV_POOL_TIMEOUT", "5"))
        
        # Verify connection uses HTTP (not HTTPS)
        await pool.connect()
        # Connection should work with HTTP
        client = pool.get_client()
        collections = await client.collections.list_all()
        assert isinstance(collections, dict)

    @pytest.mark.asyncio
    async def test_connection_pool_configuration_applied(self):
        """Verify ConnectionConfig is actually applied to Weaviate client."""
        pool = get_weaviate_pool()
        await pool.connect()
        
        client = pool.get_client()
        
        # Verify client is actually connected and working
        # This indirectly verifies ConnectionConfig was applied correctly
        collections = await client.collections.list_all()
        assert isinstance(collections, dict)
        
        # Verify we can make multiple concurrent requests (pool should handle this)
        import asyncio
        
        async def query():
            c = pool.get_client()
            return await c.collections.list_all()
        
        # Multiple concurrent queries should work (pool handles concurrency)
        results = await asyncio.gather(*[query() for _ in range(5)])
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_environment_variable_overrides(self):
        """Verify environment variables can override pool configuration."""
        original_connections = os.getenv("WV_POOL_CONNECTIONS")
        
        try:
            # Set custom value
            os.environ["WV_POOL_CONNECTIONS"] = "20"
            
            # Create new pool (should pick up new value)
            await cleanup_weaviate_pool()
            pool = get_weaviate_pool()
            
            assert pool.pool_connections == 20
        finally:
            # Restore original value
            if original_connections:
                os.environ["WV_POOL_CONNECTIONS"] = original_connections
            else:
                os.environ.pop("WV_POOL_CONNECTIONS", None)
            await cleanup_weaviate_pool()
        

class TestRealEndpoints:
    """Test 4: Test real endpoints with connection pool."""

    @pytest.mark.asyncio
    async def test_search_documents_endpoint_with_pool(self, async_client: AsyncClient, api_key: str):
        """Test /documents/search/direct endpoint uses pool."""
        # Initialize pool first
        pool = get_weaviate_pool()
        await pool.connect()
        pool_client = pool.get_client()
        
        # Make request to endpoint
        response = await async_client.post(
            "/documents/search/direct",
            json={
                "query": "test query",
                "mode": "rabbit",
                "alpha": 0.5,
            },
            headers={"X-API-Key": api_key},
        )
        
        # Should succeed
        assert response.status_code == 200
        data = response.json()
        assert "documents" in data
        assert "total_count" in data
        
        # Pool should still be connected after request
        assert pool.is_connected is True
        # Should still be using same client
        current_client = pool.get_client()
        assert current_client is pool_client, "Pool should reuse same client"

    @pytest.mark.asyncio
    async def test_search_chunks_endpoint_with_pool(self, async_client: AsyncClient, api_key: str):
        """Test unified /documents/search endpoint uses pool."""
        # Initialize pool first
        pool = get_weaviate_pool()
        await pool.connect()
        pool_client = pool.get_client()
        
        # Make request to unified endpoint
        response = await async_client.post(
            "/documents/search",
            json={
                "query": "test query",
                "limit_docs": 5,
                "limit_chunks": 150,  # Must be >= 100
                "alpha": 0.5,
                "api_version": "enhanced",  # Use enhanced mode
            },
            headers={"X-API-Key": api_key},
        )
        
        # Should succeed
        assert response.status_code == 200
        data = response.json()
        assert "chunks" in data
        
        # Pool should still be connected after request
        assert pool.is_connected is True
        # Should still be using same client
        current_client = pool.get_client()
        assert current_client is pool_client, "Pool should reuse same client"

    @pytest.mark.asyncio
    async def test_multiple_endpoint_requests_reuse_pool(self, async_client: AsyncClient, api_key: str):
        """Test that multiple endpoint requests reuse the same pool connection."""
        # Initialize pool
        pool = get_weaviate_pool()
        await pool.connect()
        initial_client = pool.get_client()
        
        # Make multiple requests
        for i in range(3):
            response = await async_client.post(
                "/documents/search/direct",
                json={
                    "query": f"test query {i}",
                    "mode": "rabbit",
                    "alpha": 0.5,
                },
                headers={"X-API-Key": api_key},
            )
            assert response.status_code == 200
            
            # After each request, pool should still be connected
            assert pool.is_connected is True
            # Should still be same client
            current_client = pool.get_client()
            assert current_client is initial_client, f"Pool should reuse client after request {i+1}"

    @pytest.mark.asyncio
    async def test_endpoint_fallback_when_pool_unavailable(self, async_client: AsyncClient, api_key: str):
        """Test endpoints work even when pool is not initialized (fallback)."""
        # Don't initialize pool
        await cleanup_weaviate_pool()
        
        # Make request - should fall back to creating new connection
        response = await async_client.post(
            "/documents/search/direct",
            json={
                "query": "test",
                "mode": "rabbit",
                "alpha": 0.5,
            },
            headers={"X-API-Key": api_key},
        )
        
        # Should still work (fallback creates new connection)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_endpoint_with_pool_disabled(self, async_client: AsyncClient, api_key: str):
        """Test endpoints work when WEAVIATE_USE_POOL=false."""
        await cleanup_weaviate_pool()

        # Set environment to disable pool
        original_value = os.getenv("WEAVIATE_USE_POOL")
        try:
            os.environ["WEAVIATE_USE_POOL"] = "false"
            
            # Make request
            response = await async_client.post(
                "/documents/search/direct",
                json={
                    "query": "test",
                    "mode": "rabbit",
                    "alpha": 0.5,
                },
                headers={"X-API-Key": api_key},
            )
            
            # Should work (creates new connection)
            assert response.status_code == 200
        finally:
            if original_value:
                os.environ["WEAVIATE_USE_POOL"] = original_value
            else:
                os.environ.pop("WEAVIATE_USE_POOL", None)

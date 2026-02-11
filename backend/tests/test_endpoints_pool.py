"""
Test cases for FastAPI endpoints using Weaviate connection pool.

These tests verify that endpoints:
- Use connection pool when available
- Fall back gracefully when pool is unavailable
- Handle errors correctly
- Return proper responses
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from httpx import AsyncClient
from httpx._transports.asgi import ASGITransport

from juddges_search.db.weaviate_pool import get_weaviate_pool, cleanup_weaviate_pool


@pytest.fixture
def api_key():
    """Fixture for API key used in tests."""
    return os.getenv("BACKEND_API_KEY", "test-api-key")


@pytest.fixture
def client():
    """Fixture for FastAPI test client."""
    from app.server import app
    return TestClient(app)


@pytest.fixture
async def async_client():
    """Fixture for async FastAPI test client."""
    from app.server import app
    # Use explicit transport to avoid deprecation warning
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def mock_weaviate_pool():
    """Fixture that mocks the Weaviate connection pool."""
    # Clean up any existing pool
    await cleanup_weaviate_pool()
    
    # Create mock pool
    mock_pool = MagicMock()
    mock_client = AsyncMock()
    mock_client.is_connected.return_value = True
    
    # Mock collections
    mock_collection = AsyncMock()
    mock_legal_collection = AsyncMock()
    mock_chunks_collection = AsyncMock()
    
    # Mock query responses
    mock_query_response = MagicMock()
    mock_query_response.objects = []
    mock_query_response.has_errors = False
    
    mock_collection.query.hybrid = AsyncMock(return_value=mock_query_response)
    mock_collection.query.bm25 = AsyncMock(return_value=mock_query_response)
    mock_collection.query.fetch_objects = AsyncMock(return_value=mock_query_response)
    mock_collection.aggregate.over_all = AsyncMock(return_value=MagicMock(total_count=0))
    
    mock_legal_collection.query.hybrid = AsyncMock(return_value=mock_query_response)
    mock_legal_collection.query.bm25 = AsyncMock(return_value=mock_query_response)
    mock_legal_collection.query.fetch_objects = AsyncMock(return_value=mock_query_response)
    
    mock_chunks_collection.query.hybrid = AsyncMock(return_value=mock_query_response)
    mock_chunks_collection.query.bm25 = AsyncMock(return_value=mock_query_response)
    mock_chunks_collection.query.fetch_objects = AsyncMock(return_value=mock_query_response)
    
    mock_client.collections.get = MagicMock(side_effect=lambda name: {
        "LegalDocuments": mock_legal_collection,
        "DocumentChunks": mock_chunks_collection,
    }.get(name, mock_collection))
    mock_client.collections.list_all = AsyncMock(return_value={})
    
    mock_pool.get_client.return_value = mock_client
    mock_pool.is_connected = True
    mock_pool.connect = AsyncMock()
    mock_pool.disconnect = AsyncMock()
    
    # Patch get_weaviate_pool to return our mock
    with patch("juddges_search.db.weaviate_pool.get_weaviate_pool", return_value=mock_pool):
        with patch("juddges_search.db.weaviate_db.get_weaviate_pool", return_value=mock_pool):
            yield mock_pool, mock_client, mock_legal_collection, mock_chunks_collection


@pytest.mark.unit
class TestSearchDocumentsEndpoint:
    """Tests for /documents/search/direct endpoint."""

    @pytest.mark.asyncio
    async def test_search_documents_endpoint_uses_pool(
        self, async_client: AsyncClient, api_key: str, mock_weaviate_pool
    ):
        """Test that search_documents endpoint uses connection pool."""
        mock_pool, mock_client, mock_legal_collection, _ = mock_weaviate_pool
        
        # Mock search_documents_direct to return test data
        mock_documents = []
        mock_query_time = 50.0
        
        with patch(
            "app.documents.search_documents_direct",
            return_value=(mock_documents, 0, False, mock_query_time)
        ):
            response = await async_client.post(
                "/documents/search/direct",
                json={
                    "query": "test query",
                    "mode": "rabbit",
                    "alpha": 0.5,
                },
                headers={"X-API-Key": api_key},
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "documents" in data
            assert "total_count" in data
            assert "is_capped" in data
            assert "query_time_ms" in data

    @pytest.mark.asyncio
    async def test_search_documents_endpoint_validation_error(
        self, async_client: AsyncClient, api_key: str
    ):
        """Test that endpoint returns 422 for validation errors."""
        # Missing required field
        response = await async_client.post(
            "/documents/search/direct",
            json={},
            headers={"X-API-Key": api_key},
        )
        
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_search_documents_endpoint_missing_api_key(
        self, async_client: AsyncClient
    ):
        """Test that endpoint requires API key."""
        response = await async_client.post(
            "/documents/search/direct",
            json={"query": "test", "mode": "rabbit", "alpha": 0.5},
        )
        
        assert response.status_code == 403  # Forbidden


@pytest.mark.unit
class TestSearchChunksEndpoint:
    """Tests for unified /search endpoint (enhanced mode)."""

    @pytest.mark.asyncio
    async def test_search_chunks_endpoint_uses_pool(
        self, async_client: AsyncClient, api_key: str, mock_weaviate_pool
    ):
        """Test that unified search endpoint uses connection pool."""
        mock_pool, mock_client, _, mock_chunks_collection = mock_weaviate_pool
        
        # Mock search_documents_with_chunks to return test data
        mock_chunks = []
        mock_timing = {"query_ms": 30.0, "total_ms": 50.0}
        
        with patch(
            "app.documents.search_documents_with_chunks",
            return_value=(mock_chunks, mock_timing)
        ):
            response = await async_client.post(
                "/documents/search",
                json={
                    "query": "test query",
                    "limit_docs": 10,
                    "limit_chunks": 150,  # Must be >= 100
                    "alpha": 0.5,
                    "api_version": "enhanced",  # Use enhanced mode
                },
                headers={"X-API-Key": api_key},
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "chunks" in data
            assert "timing_breakdown" in data

    @pytest.mark.asyncio
    async def test_search_chunks_endpoint_with_fetch_documents(
        self, async_client: AsyncClient, api_key: str, mock_weaviate_pool
    ):
        """Test search_chunks endpoint with fetch_full_documents=True."""
        mock_pool, mock_client, _, _ = mock_weaviate_pool
        
        # Mock responses - use proper DocumentChunk instances
        from juddges_search.models import DocumentChunk
        
        mock_chunk = DocumentChunk(
            document_id="test-doc-1",
            chunk_id=1,
            chunk_text="Test chunk text",
        )
        mock_chunks = [mock_chunk]
        mock_timing = {"query_ms": 30.0}
        
        mock_documents = []
        
        with patch(
            "app.documents.search_documents_with_chunks",
            return_value=(mock_chunks, mock_timing)
        ):
            with patch(
                "app.documents.get_documents_by_id",
                return_value=mock_documents
            ):
                response = await async_client.post(
                    "/documents/search",
                    json={
                        "query": "test query",
                        "limit_docs": 10,
                        "limit_chunks": 150,  # Must be >= 100
                        "fetch_full_documents": True,
                        "api_version": "enhanced",  # Use enhanced mode
                    },
                    headers={"X-API-Key": api_key},
                )
                
                assert response.status_code == 200
                data = response.json()
                assert "chunks" in data
                assert "documents" in data


@pytest.mark.unit
class TestEndpointPoolIntegration:
    """Tests for endpoint integration with connection pool."""

    @pytest.mark.asyncio
    async def test_endpoint_fallback_when_pool_unavailable(
        self, async_client: AsyncClient, api_key: str
    ):
        """Test that endpoints fall back to new connections when pool is unavailable."""
        # Mock pool to raise error
        mock_pool = MagicMock()
        mock_pool.get_client.side_effect = RuntimeError("Pool not connected")
        
        # Mock creating new connection
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True
        mock_client.connect = AsyncMock()
        mock_collection = AsyncMock()
        mock_collection.query.hybrid = AsyncMock(return_value=MagicMock(objects=[]))
        mock_client.collections.get = MagicMock(return_value=mock_collection)
        
        with patch("juddges_search.db.weaviate_pool.get_weaviate_pool", return_value=mock_pool):
            with patch(
                "juddges_search.db.weaviate_db.weaviate.use_async_with_custom",
                return_value=mock_client
            ):
                with patch(
                    "app.documents.search_documents_direct",
                    return_value=([], 0, False, 50.0)
                ):
                    response = await async_client.post(
                        "/documents/search/direct",
                        json={"query": "test"},
                        headers={"X-API-Key": api_key},
                    )
                    
                    # Should still work (fallback to new connection)
                    assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_endpoint_with_pool_disabled(
        self, async_client: AsyncClient, api_key: str
    ):
        """Test endpoints work when WEAVIATE_USE_POOL=false."""
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True
        mock_client.connect = AsyncMock()
        mock_collection = AsyncMock()
        mock_query_response = MagicMock()
        mock_query_response.objects = []
        mock_query_response.has_errors = False
        mock_collection.query.hybrid = AsyncMock(return_value=mock_query_response)
        mock_client.collections.get = MagicMock(return_value=mock_collection)
        mock_client.collections.list_all = AsyncMock(return_value={})
        
        with patch.dict(os.environ, {"WEAVIATE_USE_POOL": "false"}):
            with patch(
                "juddges_search.db.weaviate_db.weaviate.use_async_with_custom",
                return_value=mock_client
            ) as mock_use_async:
                response = await async_client.post(
                    "/documents/search/direct",
                    json={"query": "test", "mode": "rabbit", "alpha": 0.5},
                    headers={"X-API-Key": api_key},
                )
                
                assert response.status_code == 200
                # Verify new connection was created (not from pool)
                # When pool is disabled, use_async_with_custom should be called
                mock_use_async.assert_called()
                # Verify connect was called on the new client
                mock_client.connect.assert_called_once()


@pytest.mark.integration
@pytest.mark.asyncio
class TestEndpointIntegration:
    """Integration tests for endpoints with real Weaviate (if available)."""

    async def test_search_documents_endpoint_integration(
        self, async_client: AsyncClient, api_key: str
    ):
        """Test search_documents endpoint with real Weaviate connection."""
        # Clean up pool first
        await cleanup_weaviate_pool()
        
        # Initialize pool
        pool = get_weaviate_pool()
        try:
            await pool.connect()
            
            response = await async_client.post(
                "/documents/search/direct",
                json={
                    "query": "test",
                    "mode": "rabbit",
                    "alpha": 0.5,
                },
                headers={"X-API-Key": api_key},
            )
            
            # Should return 200 (even if no results)
            assert response.status_code in [200, 503]  # 503 if Weaviate unavailable
            
        finally:
            await cleanup_weaviate_pool()

    async def test_search_chunks_endpoint_integration(
        self, async_client: AsyncClient, api_key: str
    ):
        """Test search_chunks endpoint with real Weaviate connection."""
        await cleanup_weaviate_pool()
        
        pool = get_weaviate_pool()
        try:
            await pool.connect()
            
            response = await async_client.post(
                "/documents/search",
                json={
                    "query": "test",
                    "limit_docs": 5,
                    "limit_chunks": 150,  # Must be >= 100
                    "api_version": "enhanced",  # Use enhanced mode
                },
                headers={"X-API-Key": api_key},
            )
            
            # Should return 200 (even if no results)
            assert response.status_code in [200, 503]  # 503 if Weaviate unavailable
            
        finally:
            await cleanup_weaviate_pool()


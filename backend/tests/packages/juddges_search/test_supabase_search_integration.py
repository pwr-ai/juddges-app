"""
Integration tests for Supabase pgvector semantic search.

These tests require a live Supabase instance with:
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
- judgments table with pgvector extension enabled
- Sample data loaded in the database

Run with: poetry run pytest tests/packages/juddges_search/test_supabase_search_integration.py -v -m integration
"""

import os
import pytest
from typing import List

from juddges_search.retrieval.supabase_search import (
    SupabaseSearchClient,
    search_chunks,
    search_chunks_vector,
    search_chunks_term,
    search_documents,
    reset_search_client,
)
from juddges_search.models import DocumentChunk


# Skip all tests if Supabase credentials are not available
pytestmark = pytest.mark.skipif(
    not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
    reason="Supabase credentials not available"
)


@pytest.fixture(scope="module")
def search_client():
    """Create a search client for integration tests."""
    client = SupabaseSearchClient()
    yield client
    # Cleanup
    reset_search_client()


@pytest.mark.integration
class TestSupabaseSearchIntegration:
    """Integration tests for Supabase search functionality."""

    @pytest.mark.asyncio
    async def test_vector_search_chunks_real_db(self, search_client):
        """Test vector search against real database."""
        # This test requires actual data in the database
        query_embedding = [0.1] * 1536  # Mock embedding

        results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=5,
            match_threshold=0.3
        )

        # Verify results structure
        assert isinstance(results, list)
        if len(results) > 0:
            assert isinstance(results[0], DocumentChunk)
            assert hasattr(results[0], 'document_id')
            assert hasattr(results[0], 'chunk_text')
            assert hasattr(results[0], 'similarity')

    @pytest.mark.asyncio
    async def test_full_text_search_chunks_real_db(self, search_client):
        """Test full-text search against real database."""
        # Search for common legal terms
        results = await search_client.full_text_search_chunks(
            query="court judgment decision",
            match_count=5
        )

        assert isinstance(results, list)
        if len(results) > 0:
            assert isinstance(results[0], DocumentChunk)
            # Verify the chunk contains some of the search terms
            chunk_text_lower = results[0].chunk_text.lower()
            search_terms = ["court", "judgment", "decision"]
            # At least one term should match
            assert any(term in chunk_text_lower for term in search_terms)

    @pytest.mark.asyncio
    async def test_hybrid_search_chunks_real_db(self, search_client):
        """Test hybrid search combining vector and text search."""
        results = await search_client.hybrid_search_chunks(
            query="contract law dispute",
            match_count=5,
            vector_weight=0.6,
            text_weight=0.4
        )

        assert isinstance(results, list)
        if len(results) > 0:
            result = results[0]
            assert isinstance(result, DocumentChunk)
            # Hybrid search should populate combined_score
            assert hasattr(result, 'combined_score')

    @pytest.mark.asyncio
    async def test_search_with_language_filter_real_db(self, search_client):
        """Test search with language filtering."""
        query_embedding = [0.1] * 1536

        # Search for Polish documents
        pl_results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=5,
            languages=["pl"]
        )

        # All results should be Polish language
        for result in pl_results:
            assert result.language == "pl", f"Expected Polish language, got {result.language}"

    @pytest.mark.asyncio
    async def test_search_with_document_type_filter_real_db(self, search_client):
        """Test search with document type filtering."""
        query_embedding = [0.1] * 1536

        # Search for judgment documents
        results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=5,
            document_types=["judgment"]
        )

        # All results should be judgment type
        for result in results:
            assert result.document_type == "judgment", f"Expected judgment type, got {result.document_type}"

    @pytest.mark.asyncio
    async def test_search_documents_real_db(self):
        """Test document-level search."""
        results = await search_documents(
            query="contract dispute damages",
            max_results=5
        )

        assert isinstance(results, list)
        if len(results) > 0:
            doc = results[0]
            assert "uuid" in doc
            assert "document_id" in doc or "signature" in doc
            assert "score" in doc

    @pytest.mark.asyncio
    async def test_public_api_search_chunks(self):
        """Test public API search_chunks function."""
        results = await search_chunks(
            query="legal precedent",
            max_chunks=5
        )

        assert isinstance(results, list)
        for result in results:
            assert isinstance(result, DocumentChunk)

    @pytest.mark.asyncio
    async def test_public_api_search_chunks_vector(self):
        """Test public API search_chunks_vector function."""
        results = await search_chunks_vector(
            query="contract law",
            max_chunks=5
        )

        assert isinstance(results, list)
        for result in results:
            assert isinstance(result, DocumentChunk)
            # Vector search should populate vector_score
            assert hasattr(result, 'vector_score')

    @pytest.mark.asyncio
    async def test_public_api_search_chunks_term(self):
        """Test public API search_chunks_term function."""
        results = await search_chunks_term(
            query="plaintiff defendant",
            max_chunks=5
        )

        assert isinstance(results, list)
        for result in results:
            assert isinstance(result, DocumentChunk)

    @pytest.mark.asyncio
    async def test_combined_filters(self, search_client):
        """Test search with multiple filters combined."""
        query_embedding = [0.1] * 1536

        results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=5,
            languages=["en"],
            document_types=["judgment"]
        )

        # Verify all filters are applied
        for result in results:
            assert result.language == "en"
            assert result.document_type == "judgment"

    @pytest.mark.asyncio
    async def test_empty_results_handling(self, search_client):
        """Test handling of queries that return no results."""
        # Use a very high similarity threshold to get no results
        query_embedding = [0.1] * 1536

        results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=5,
            match_threshold=0.999  # Very high threshold
        )

        # Should return empty list, not error
        assert isinstance(results, list)
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_pagination_with_match_count(self, search_client):
        """Test pagination using match_count parameter."""
        query_embedding = [0.1] * 1536

        # Get 3 results
        results_3 = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=3
        )

        # Get 10 results
        results_10 = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=10
        )

        # Should respect the limit
        assert len(results_3) <= 3
        assert len(results_10) <= 10

        # If there are enough results, 10 should be >= 3
        if len(results_10) >= 3:
            assert len(results_10) >= len(results_3)


@pytest.mark.integration
class TestSearchPerformance:
    """Performance tests for search operations."""

    @pytest.mark.asyncio
    async def test_vector_search_performance(self, search_client):
        """Test vector search completes within acceptable time."""
        import time

        query_embedding = [0.1] * 1536

        start_time = time.time()
        results = await search_client.vector_search_chunks(
            query_embedding=query_embedding,
            match_count=10
        )
        elapsed_time = time.time() - start_time

        # Vector search with HNSW index should be fast (< 1 second for 10 results)
        assert elapsed_time < 1.0, f"Vector search took {elapsed_time:.2f}s, expected < 1.0s"

    @pytest.mark.asyncio
    async def test_full_text_search_performance(self, search_client):
        """Test full-text search completes within acceptable time."""
        import time

        start_time = time.time()
        results = await search_client.full_text_search_chunks(
            query="contract dispute",
            match_count=10
        )
        elapsed_time = time.time() - start_time

        # Full-text search should also be fast (< 1 second)
        assert elapsed_time < 1.0, f"Full-text search took {elapsed_time:.2f}s, expected < 1.0s"

    @pytest.mark.asyncio
    async def test_hybrid_search_performance(self, search_client):
        """Test hybrid search completes within acceptable time."""
        import time

        start_time = time.time()
        results = await search_client.hybrid_search_chunks(
            query="legal precedent case law",
            match_count=10
        )
        elapsed_time = time.time() - start_time

        # Hybrid search runs both searches, so allow more time (< 2 seconds)
        assert elapsed_time < 2.0, f"Hybrid search took {elapsed_time:.2f}s, expected < 2.0s"

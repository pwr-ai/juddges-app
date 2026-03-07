"""
Unit tests for Supabase pgvector semantic search module.

These tests verify the search functionality using mocked Supabase client
to avoid requiring a live database connection.
"""

from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest
from juddges_search.models import DocumentChunk
from juddges_search.retrieval.supabase_search import (
    SupabaseSearchClient,
    get_search_client,
    reset_search_client,
    search_chunks,
    search_chunks_term,
    search_chunks_vector,
    search_documents,
)


@pytest.fixture
def mock_supabase_client():
    """Create a mock Supabase client for testing."""
    mock_client = Mock()
    mock_table = Mock()
    mock_client.table = Mock(return_value=mock_table)
    return mock_client, mock_table


@pytest.fixture
def sample_chunk_data() -> list[dict[str, Any]]:
    """Sample chunk data for testing."""
    return [
        {
            "document_id": "doc_123",
            "document_type": "judgment",
            "language": "pl",
            "chunk_id": 1,
            "chunk_text": "The court ruled in favor of the plaintiff.",
            "segment_type": "paragraph",
            "position": 1,
            "similarity": 0.89,
            "judgments": {
                "court_name": "Supreme Court",
                "decision_date": "2024-01-15",
                "jurisdiction": "PL",
            },
        },
        {
            "document_id": "doc_456",
            "document_type": "judgment",
            "language": "en",
            "chunk_id": 2,
            "chunk_text": "The defendant was found liable for damages.",
            "segment_type": "paragraph",
            "position": 2,
            "similarity": 0.75,
            "judgments": {
                "court_name": "Court of Appeal",
                "decision_date": "2024-02-20",
                "jurisdiction": "UK",
            },
        },
    ]


@pytest.fixture
def sample_document_data() -> list[dict[str, Any]]:
    """Sample document data for testing."""
    return [
        {
            "id": "uuid-123",
            "case_number": "II FSK 1234/21",
            "title": "Smith v. Jones",
            "summary": "Contract dispute regarding damages.",
            "court_name": "Supreme Court",
            "decision_date": "2024-01-15",
            "jurisdiction": "PL",
        },
        {
            "id": "uuid-456",
            "case_number": "CA 2024/789",
            "title": "Brown v. Green",
            "summary": "Tort claim for negligence.",
            "court_name": "Court of Appeal",
            "decision_date": "2024-02-20",
            "jurisdiction": "UK",
        },
    ]


@pytest.mark.unit
class TestSupabaseSearchClient:
    """Test suite for SupabaseSearchClient class."""

    def test_init_with_valid_env_vars(self, monkeypatch):
        """Test successful initialization with environment variables."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        with patch(
            "juddges_search.retrieval.supabase_search.create_client"
        ) as mock_create:
            mock_create.return_value = Mock()
            client = SupabaseSearchClient()

            assert client.url == "https://test.supabase.co"
            assert client.service_key == "test-key"
            mock_create.assert_called_once()

    def test_init_without_env_vars(self, monkeypatch):
        """Test initialization fails without required environment variables."""
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

        with pytest.raises(
            ValueError, match="Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        ):
            SupabaseSearchClient()

    @pytest.mark.asyncio
    async def test_vector_search_chunks_success(
        self, mock_supabase_client, sample_chunk_data, monkeypatch
    ):
        """Test successful vector search on chunks."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client, mock_table = mock_supabase_client

        # Setup mock response
        mock_response = Mock()
        mock_response.data = sample_chunk_data
        mock_table.select.return_value.in_.return_value.execute.return_value = (
            mock_response
        )
        mock_table.select.return_value.execute.return_value = mock_response

        with patch(
            "juddges_search.retrieval.supabase_search.create_client",
            return_value=mock_client,
        ):
            client = SupabaseSearchClient()
            client.client = mock_client

            query_embedding = [0.1] * 1536  # Mock 1536-dim embedding

            results = await client.vector_search_chunks(
                query_embedding=query_embedding, match_count=10, match_threshold=0.5
            )

            assert len(results) == 2
            assert isinstance(results[0], DocumentChunk)
            assert results[0].document_id == "doc_123"
            assert results[0].chunk_text == "The court ruled in favor of the plaintiff."
            assert results[0].similarity == 0.89

    @pytest.mark.asyncio
    async def test_vector_search_chunks_with_filters(
        self, mock_supabase_client, sample_chunk_data, monkeypatch
    ):
        """Test vector search with language and document type filters."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client, mock_table = mock_supabase_client

        # Setup mock chain
        mock_select = Mock()
        mock_in_lang = Mock()
        mock_in_doc = Mock()
        mock_response = Mock()
        mock_response.data = sample_chunk_data[:1]  # Return only one result

        mock_table.select.return_value = mock_select
        mock_select.in_.return_value = mock_in_lang
        mock_in_lang.in_.return_value = mock_in_doc
        mock_in_doc.execute.return_value = mock_response

        with patch(
            "juddges_search.retrieval.supabase_search.create_client",
            return_value=mock_client,
        ):
            client = SupabaseSearchClient()
            client.client = mock_client

            query_embedding = [0.1] * 1536

            await client.vector_search_chunks(
                query_embedding=query_embedding,
                match_count=10,
                languages=["pl"],
                document_types=["judgment"],
            )

            # Verify filters were applied (mock chain was called)
            mock_table.select.assert_called_once()

    @pytest.mark.asyncio
    async def test_full_text_search_chunks_success(
        self, mock_supabase_client, sample_chunk_data, monkeypatch
    ):
        """Test successful full-text search on chunks."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client, mock_table = mock_supabase_client

        # Setup mock response with text search results
        sample_chunk_data[0]["rank"] = 0.95
        sample_chunk_data[1]["rank"] = 0.72

        mock_response = Mock()
        mock_response.data = sample_chunk_data

        # Mock the chain: select -> text_search -> limit -> execute
        mock_select = Mock()
        mock_text_search = Mock()
        mock_limit = Mock()

        mock_table.select.return_value = mock_select
        mock_select.text_search.return_value = mock_text_search
        mock_text_search.limit.return_value = mock_limit
        mock_limit.execute.return_value = mock_response

        with patch(
            "juddges_search.retrieval.supabase_search.create_client",
            return_value=mock_client,
        ):
            client = SupabaseSearchClient()
            client.client = mock_client

            results = await client.full_text_search_chunks(
                query="contract dispute", match_count=10
            )

            assert len(results) == 2
            assert isinstance(results[0], DocumentChunk)
            mock_table.select.assert_called_once()
            mock_select.text_search.assert_called_once_with(
                "chunk_text", "contract dispute", config="simple"
            )

    @pytest.mark.asyncio
    async def test_full_text_search_empty_results(
        self, mock_supabase_client, monkeypatch
    ):
        """Test full-text search with no results."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client, mock_table = mock_supabase_client

        mock_response = Mock()
        mock_response.data = []

        mock_select = Mock()
        mock_text_search = Mock()
        mock_limit = Mock()

        mock_table.select.return_value = mock_select
        mock_select.text_search.return_value = mock_text_search
        mock_text_search.limit.return_value = mock_limit
        mock_limit.execute.return_value = mock_response

        with patch(
            "juddges_search.retrieval.supabase_search.create_client",
            return_value=mock_client,
        ):
            client = SupabaseSearchClient()
            client.client = mock_client

            results = await client.full_text_search_chunks(
                query="nonexistent query", match_count=10
            )

            assert len(results) == 0

    @pytest.mark.asyncio
    async def test_merge_search_results(self, monkeypatch):
        """Test merging vector and text search results."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        with patch("juddges_search.retrieval.supabase_search.create_client"):
            client = SupabaseSearchClient()

            # Create mock chunks with different scores
            chunk1 = DocumentChunk(
                document_id="doc_1",
                chunk_id=1,
                chunk_text="Text 1",
                vector_score=0.9,
                text_score=0.0,
            )
            chunk2 = DocumentChunk(
                document_id="doc_2",
                chunk_id=2,
                chunk_text="Text 2",
                vector_score=0.0,
                text_score=0.8,
            )
            chunk3 = DocumentChunk(
                document_id="doc_3",
                chunk_id=3,
                chunk_text="Text 3",
                vector_score=0.7,
                text_score=0.6,
            )

            vector_results = [chunk1, chunk3]
            text_results = [chunk2, chunk3]

            merged = client._merge_search_results(
                vector_results,
                text_results,
                vector_weight=0.7,
                text_weight=0.3,
                limit=10,
            )

            # chunk3 should have highest combined score: 0.7*0.7 + 0.3*0.6 = 0.67
            # chunk1: 0.7*0.9 + 0.3*0.0 = 0.63
            # chunk2: 0.7*0.0 + 0.3*0.8 = 0.24
            assert len(merged) == 3
            assert merged[0].document_id == "doc_3"  # Highest combined score
            assert merged[0].combined_score == pytest.approx(0.67, abs=0.01)


@pytest.mark.unit
class TestPublicAPI:
    """Test suite for public API functions."""

    @pytest.mark.asyncio
    async def test_search_chunks(self, monkeypatch):
        """Test search_chunks function with hybrid search."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_chunks = [
            DocumentChunk(
                document_id="doc_1",
                chunk_id=1,
                chunk_text="Test chunk",
                combined_score=0.85,
            )
        ]

        with patch(
            "juddges_search.retrieval.supabase_search.SupabaseSearchClient"
        ) as MockClient:
            mock_instance = MockClient.return_value
            mock_instance.hybrid_search_chunks = AsyncMock(return_value=mock_chunks)

            # Reset singleton to force new instance
            reset_search_client()

            results = await search_chunks(
                query="test query",
                max_chunks=10,
                languages=["pl"],
                document_types=["judgment"],
            )

            assert len(results) == 1
            assert results[0].document_id == "doc_1"
            mock_instance.hybrid_search_chunks.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_chunks_vector(self, monkeypatch):
        """Test search_chunks_vector function."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_chunks = [
            DocumentChunk(
                document_id="doc_1",
                chunk_id=1,
                chunk_text="Test chunk",
                vector_score=0.92,
            )
        ]

        with (
            patch(
                "juddges_search.retrieval.supabase_search.SupabaseSearchClient"
            ) as MockClient,
            patch("juddges_search.retrieval.supabase_search.embed_texts") as mock_embed,
        ):
            mock_embed.return_value = [0.1] * 1536
            mock_instance = MockClient.return_value
            mock_instance.vector_search_chunks = AsyncMock(return_value=mock_chunks)

            reset_search_client()

            results = await search_chunks_vector(query="test query", max_chunks=10)

            assert len(results) == 1
            mock_embed.assert_called_once_with("test query")
            mock_instance.vector_search_chunks.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_chunks_term(self, monkeypatch):
        """Test search_chunks_term function."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_chunks = [
            DocumentChunk(
                document_id="doc_1",
                chunk_id=1,
                chunk_text="Test chunk with contract law",
                text_score=0.88,
            )
        ]

        with patch(
            "juddges_search.retrieval.supabase_search.SupabaseSearchClient"
        ) as MockClient:
            mock_instance = MockClient.return_value
            mock_instance.full_text_search_chunks = AsyncMock(return_value=mock_chunks)

            reset_search_client()

            results = await search_chunks_term(query="contract law", max_chunks=10)

            assert len(results) == 1
            assert results[0].text_score == 0.88
            mock_instance.full_text_search_chunks.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_documents(
        self, mock_supabase_client, sample_document_data, monkeypatch
    ):
        """Test search_documents function."""
        monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

        mock_client, mock_table = mock_supabase_client

        mock_response = Mock()
        mock_response.data = sample_document_data

        mock_select = Mock()
        mock_limit = Mock()

        mock_table.select.return_value = mock_select
        mock_select.limit.return_value = mock_limit
        mock_limit.execute.return_value = mock_response

        with (
            patch(
                "juddges_search.retrieval.supabase_search.create_client",
                return_value=mock_client,
            ),
            patch("juddges_search.retrieval.supabase_search.embed_texts") as mock_embed,
        ):
            mock_embed.return_value = [0.1] * 1536

            reset_search_client()

            # Need to patch the client.table access through get_search_client
            with patch(
                "juddges_search.retrieval.supabase_search.get_search_client"
            ) as mock_get_client:
                mock_search_client = Mock()
                mock_search_client.client = mock_client
                mock_get_client.return_value = mock_search_client

                results = await search_documents(
                    query="contract dispute", max_results=10
                )

                assert len(results) == 2
                assert results[0]["document_id"] == "II FSK 1234/21"
                assert results[0]["court_name"] == "Supreme Court"


@pytest.mark.unit
def test_get_search_client_singleton(monkeypatch):
    """Test that get_search_client returns singleton instance."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    with patch("juddges_search.retrieval.supabase_search.create_client"):
        reset_search_client()
        client1 = get_search_client()
        client2 = get_search_client()

        assert client1 is client2


@pytest.mark.unit
def test_reset_search_client(monkeypatch):
    """Test reset_search_client clears singleton."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

    with patch("juddges_search.retrieval.supabase_search.create_client"):
        client1 = get_search_client()
        reset_search_client()
        client2 = get_search_client()

        assert client1 is not client2

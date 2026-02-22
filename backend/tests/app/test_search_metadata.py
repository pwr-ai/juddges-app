"""Tests for search metadata enhancement (Task 2)."""

import pytest
from app.documents import search_documents
from app.models import SearchChunksRequest


@pytest.mark.integration
async def test_search_returns_chunk_metadata():
    """Test that search returns proper chunk metadata."""
    request = SearchChunksRequest(query="contract law", limit_docs=5, alpha=0.5)

    response = await search_documents(request)

    assert len(response.chunks) > 0, "Should return at least one chunk"

    # Check first chunk has all metadata fields
    chunk = response.chunks[0]
    assert chunk.chunk_text is not None, "chunk_text should be present"
    assert len(chunk.chunk_text) > 0, "chunk_text should not be empty"

    assert chunk.chunk_type in ["summary", "excerpt", "title", "full_text"], (
        f"chunk_type should be valid type, got: {chunk.chunk_type}"
    )

    assert chunk.chunk_start_pos is not None, "chunk_start_pos should be present"
    assert chunk.chunk_start_pos >= 0, "chunk_start_pos should be non-negative"

    assert chunk.chunk_end_pos is not None, "chunk_end_pos should be present"
    assert chunk.chunk_end_pos >= chunk.chunk_start_pos, (
        "chunk_end_pos should be >= chunk_start_pos"
    )

    assert chunk.metadata is not None, "metadata should be present"
    assert isinstance(chunk.metadata, dict), "metadata should be a dict"

    # Check metadata contains expected fields
    assert "combined_score" in chunk.metadata, "metadata should include combined_score"

    # Check scoring fields
    assert chunk.vector_score is not None or chunk.text_score is not None, (
        "At least one score should be present"
    )
    assert chunk.combined_score is not None, "combined_score should be present"


@pytest.mark.integration
async def test_search_metadata_includes_scoring():
    """Test that chunk metadata includes detailed scoring."""
    request = SearchChunksRequest(
        query="legal precedent",
        limit_docs=3,
        alpha=0.7,  # Favor vector search
    )

    response = await search_documents(request)

    assert len(response.chunks) > 0, "Should return at least one chunk"
    chunk = response.chunks[0]

    # Verify scoring metadata
    assert chunk.vector_score is not None or chunk.vector_score == 0, (
        "vector_score should be present"
    )
    assert chunk.text_score is not None or chunk.text_score == 0, (
        "text_score should be present"
    )
    assert chunk.combined_score is not None, "combined_score should be present"

    # Verify combined score is roughly the weighted average
    # (allowing for some floating point tolerance)
    if chunk.vector_score and chunk.text_score:
        expected_combined = chunk.vector_score * 0.7 + chunk.text_score * 0.3
        assert abs(chunk.combined_score - expected_combined) < 0.01, (
            f"combined_score ({chunk.combined_score}) should match weighted average ({expected_combined})"
        )


@pytest.mark.integration
async def test_search_metadata_includes_court_info():
    """Test that chunk metadata includes court information."""
    request = SearchChunksRequest(query="criminal case", limit_docs=3, alpha=0.5)

    response = await search_documents(request)

    assert len(response.chunks) > 0, "Should return at least one chunk"
    chunk = response.chunks[0]

    # Check metadata contains court-related fields
    metadata = chunk.metadata

    # At least some court information should be present
    court_fields = ["court_name", "court_level", "jurisdiction"]
    has_court_info = any(field in metadata for field in court_fields)
    assert has_court_info, f"Metadata should include court info, got: {metadata.keys()}"


@pytest.mark.integration
async def test_chunk_type_reflects_content():
    """Test that chunk_type accurately reflects the content returned."""
    request = SearchChunksRequest(query="judgment summary", limit_docs=5, alpha=0.5)

    response = await search_documents(request)

    assert len(response.chunks) > 0, "Should return at least one chunk"

    for chunk in response.chunks:
        # chunk_type should match what's actually in chunk_text
        if chunk.chunk_type == "summary":
            # Summary chunks should be reasonably short (typically < 1000 chars)
            # but this is a soft constraint
            assert len(chunk.chunk_text) < 10000, (
                "Summary chunk_text should be reasonably concise"
            )

        elif chunk.chunk_type == "excerpt":
            # Excerpts should have content
            assert len(chunk.chunk_text) > 0, "Excerpt should have content"
            # Typically limited to ~500 chars based on migration
            assert len(chunk.chunk_text) <= 1000, "Excerpt should be limited in length"

        # All types should have matching positions
        assert chunk.chunk_end_pos == len(chunk.chunk_text), (
            f"chunk_end_pos should match text length for chunk_type={chunk.chunk_type}"
        )


@pytest.mark.unit
def test_chunk_metadata_structure():
    """Test that DocumentChunk model supports all required metadata fields."""
    from juddges_search.models import DocumentChunk

    # Test creating a DocumentChunk with all new fields
    chunk = DocumentChunk(
        document_id="test-doc-123",
        chunk_id=0,
        chunk_text="This is a test chunk",
        chunk_type="summary",
        chunk_start_pos=0,
        chunk_end_pos=20,
        metadata={
            "court_name": "Supreme Court",
            "case_number": "12345/2023",
            "combined_score": 0.85,
        },
        vector_score=0.9,
        text_score=0.75,
        combined_score=0.85,
    )

    assert chunk.chunk_type == "summary"
    assert chunk.chunk_start_pos == 0
    assert chunk.chunk_end_pos == 20
    assert chunk.metadata["court_name"] == "Supreme Court"
    assert chunk.vector_score == 0.9
    assert chunk.text_score == 0.75
    assert chunk.combined_score == 0.85


@pytest.mark.unit
def test_chunk_metadata_optional_fields():
    """Test that DocumentChunk works with minimal required fields."""
    from juddges_search.models import DocumentChunk

    # Create chunk with only required fields
    chunk = DocumentChunk(
        document_id="minimal-doc", chunk_id=0, chunk_text="Minimal chunk"
    )

    # Optional fields should have defaults
    assert chunk.chunk_type == "summary"  # Default value
    assert chunk.chunk_start_pos == 0  # Default value
    assert chunk.chunk_end_pos == 0  # Default value
    assert chunk.metadata == {}  # Default empty dict
    assert chunk.vector_score is None  # Optional, no default
    assert chunk.text_score is None  # Optional, no default
    assert chunk.combined_score is None  # Optional, no default

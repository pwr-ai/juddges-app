import os

import pytest

from app.models import SearchChunksRequest

# Skip integration tests if API keys are not configured (e.g., dummy keys)
skip_if_no_api_keys = pytest.mark.skipif(
    os.environ.get("OPENAI_API_KEY", "").startswith("sk-dummy"),
    reason="Requires valid OpenAI API key (not dummy key)",
)


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_thinking_mode_enhances_query():
    """Test that thinking mode enhances the query."""
    from app.documents import search_documents

    request = SearchChunksRequest(
        query="contract dispute", mode="thinking", limit_docs=5
    )

    response = await search_documents(request)

    assert response.query_enhancement_used is True
    assert response.enhanced_query is not None
    assert len(response.enhanced_query) > len(request.query)
    assert "contract" in response.enhanced_query.lower()


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_rabbit_mode_skips_enhancement():
    """Test that rabbit mode skips query enhancement."""
    from app.documents import search_documents

    request = SearchChunksRequest(
        query="contract dispute",
        mode="rabbit",  # Fast mode
        limit_docs=5,
    )

    response = await search_documents(request)

    assert response.query_enhancement_used is False
    assert response.enhanced_query is None


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_thinking_mode_timing_breakdown():
    """Test that thinking mode includes enhancement timing."""
    from app.documents import search_documents

    request = SearchChunksRequest(query="employment law", mode="thinking", limit_docs=3)

    response = await search_documents(request)

    assert response.timing_breakdown is not None
    assert "enhancement_ms" in response.timing_breakdown
    assert response.timing_breakdown["enhancement_ms"] > 0


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_rabbit_mode_no_enhancement_timing():
    """Test that rabbit mode has zero enhancement timing."""
    from app.documents import search_documents

    request = SearchChunksRequest(query="employment law", mode="rabbit", limit_docs=3)

    response = await search_documents(request)

    assert response.timing_breakdown is not None
    assert "enhancement_ms" in response.timing_breakdown
    assert response.timing_breakdown["enhancement_ms"] == 0


# Unit test that doesn't require API calls
@pytest.mark.unit
def test_search_request_mode_field():
    """Test that SearchChunksRequest has mode field with correct values."""
    # Test thinking mode
    request_thinking = SearchChunksRequest(query="test query", mode="thinking")
    assert request_thinking.mode == "thinking"

    # Test rabbit mode
    request_rabbit = SearchChunksRequest(query="test query", mode="rabbit")
    assert request_rabbit.mode == "rabbit"

    # Test default mode
    request_default = SearchChunksRequest(query="test query")
    assert request_default.mode == "rabbit"  # Default should be rabbit

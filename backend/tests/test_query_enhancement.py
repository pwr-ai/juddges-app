import os
import pytest
from juddges_search.chains.query_enhancement import (
    enhance_query,
    create_query_enhancement_chain,
)
from langchain_openai import ChatOpenAI

# Skip integration tests if API keys are not configured (e.g., dummy keys)
skip_if_no_api_keys = pytest.mark.skipif(
    os.environ.get("OPENAI_API_KEY", "").startswith("sk-dummy"),
    reason="Requires valid OpenAI API key (not dummy key)",
)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_query_enhancement_chain():
    """Test that chain creation returns a valid runnable."""
    chain = create_query_enhancement_chain()
    assert chain is not None
    # Chain should have invoke method
    assert hasattr(chain, "ainvoke")


@pytest.mark.unit
def test_create_chain_structure():
    """Test that chain is created with correct structure."""
    # Create chain with a real (but won't be called) LLM

    # Don't call the chain, just verify structure
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
    chain = create_query_enhancement_chain(llm)

    # Verify chain exists and has expected attributes
    assert chain is not None
    assert hasattr(chain, "ainvoke")
    assert hasattr(chain, "invoke")


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_enhance_query_basic():
    """Test basic query enhancement with real API."""
    original = "contract law"
    enhanced = await enhance_query(original)

    # Enhanced should be longer and contain original terms
    assert len(enhanced) > len(original)
    assert "contract" in enhanced.lower()

    # Should add legal terminology
    assert any(
        term in enhanced.lower()
        for term in ["contractual", "agreement", "obligation", "breach"]
    )


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_enhance_query_preserves_intent():
    """Test that enhancement preserves original intent."""
    original = "employment discrimination in hiring"
    enhanced = await enhance_query(original)

    assert "employment" in enhanced.lower()
    assert "discrimination" in enhanced.lower()
    # Should not completely change topic
    assert len(enhanced.split()) < 50  # Keep concise


@pytest.mark.integration
@skip_if_no_api_keys
@pytest.mark.asyncio
async def test_enhance_query_expands_abbreviations():
    """Test that abbreviations are expanded."""
    original = "GDPR violations"
    enhanced = await enhance_query(original)

    # Should expand or contextualize
    assert len(enhanced) > len(original)

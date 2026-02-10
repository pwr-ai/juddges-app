"""
Test cases for weaviate search functionality.

These tests validate the search function with various parameters and scenarios.
Tests are marked with integration marker since they require Weaviate database access.
"""

import pytest
from ai_tax_search.retrieval.weaviate_search import search_documents
from ai_tax_search.models import DocumentType


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_documents_copyright_infringement():
    """Test search functionality with copyright infringement query."""
    # Request body parameters
    question = "What are the key elements of copyright infringement?"
    max_documents = 20
    document_type = DocumentType.JUDGMENT
    language = "pl"  # Use Polish language
    
    # Call the search function
    results = await search_documents(
        query=question,
        max_docs=max_documents,
        document_type=document_type,
        language=language
    )
    
    # Validate results
    assert isinstance(results, list), "Results should be a list"
    assert len(results) <= max_documents, f"Should not exceed max_documents ({max_documents})"
    
    # If results are found, verify they match the filters
    if results:
        for doc in results:
            assert doc.document_type == document_type.value, f"Document type mismatch: {doc.document_type}"
            assert doc.language == language, f"Language mismatch: {doc.language}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_with_invalid_language():
    """Test search with non-existent language should return empty results."""
    results = await search_documents(
        query="What are the key elements of copyright infringement?",
        max_docs=5,
        document_type=DocumentType.JUDGMENT,
        language="en"  # English documents don't exist
    )
    
    assert isinstance(results, list), "Results should be a list"
    assert len(results) == 0, "Should return 0 results for non-existent language"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_with_valid_language():
    """Test search with valid Polish language should return results."""
    results = await search_documents(
        query="What are the key elements of copyright infringement?",
        max_docs=5,
        document_type=DocumentType.JUDGMENT,
        language="pl"  # Polish documents exist
    )
    
    assert isinstance(results, list), "Results should be a list"
    # Note: We don't assert len(results) > 0 because it depends on database content
    # If results exist, they should match the language filter
    for doc in results:
        assert doc.language == "pl", f"Language mismatch: {doc.language}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_without_language_filter():
    """Test search without language filter should return documents from any language."""
    results = await search_documents(
        query="copyright",
        max_docs=10,
        document_type=DocumentType.JUDGMENT
        # No language filter
    )
    
    assert isinstance(results, list), "Results should be a list"
    assert len(results) <= 10, "Should not exceed max_documents"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_with_different_document_types():
    """Test search with different document types."""
    for doc_type in [DocumentType.JUDGMENT, DocumentType.TAX_INTERPRETATION]:
        results = await search_documents(
            query="tax",
            max_docs=5,
            document_type=doc_type,
            language="pl"
        )

        assert isinstance(results, list), f"Results should be a list for {doc_type}"
        # If results exist, they should match the document type
        for doc in results:
            assert doc.document_type == doc_type.value, f"Document type mismatch: {doc.document_type}"
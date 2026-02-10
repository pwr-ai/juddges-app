"""
Test cases for multiple language search functionality.

These tests validate the complete language-based search workflow including
multiple language selection and filtering.
"""

import pytest
from ai_tax_search.retrieval.weaviate_search import search_documents, search_chunks_term
from ai_tax_search.models import DocumentType


@pytest.mark.integration
@pytest.mark.asyncio
async def test_multiple_language_search():
    """Test search functionality with multiple languages."""
    question = "What are the key elements of copyright infringement?"
    languages = ["pl", "en"]  # Multiple languages
    
    # Test chunk search with multiple languages
    chunk_results = await search_chunks_term(
        query=question,
        max_chunks=10,
        languages=languages
    )
    
    assert isinstance(chunk_results, list), "Results should be a list"
    assert len(chunk_results) <= 10, "Should not exceed max_chunks"
    
    # If results exist, they should match one of the requested languages
    if chunk_results:
        found_languages = {chunk.language for chunk in chunk_results}
        for lang in found_languages:
            assert lang in languages, f"Found unexpected language: {lang}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_single_language_search():
    """Test search functionality with single language."""
    question = "What are the key elements of copyright infringement?"
    languages = ["pl"]  # Single language
    
    chunk_results = await search_chunks_term(
        query=question,
        max_chunks=5,
        languages=languages
    )
    
    assert isinstance(chunk_results, list), "Results should be a list"
    
    # All results should be in Polish
    for chunk in chunk_results:
        assert chunk.language == "pl", f"Language mismatch: {chunk.language}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_empty_language_list():
    """Test search with empty language list should return all languages."""
    question = "copyright"
    
    # Test with None (should return all languages)
    results_none = await search_chunks_term(
        query=question,
        max_chunks=5,
        languages=None
    )
    
    # Test with empty list (should return all languages)
    results_empty = await search_chunks_term(
        query=question,
        max_chunks=5,
        languages=[]
    )
    
    assert isinstance(results_none, list), "Results with None should be a list"
    assert isinstance(results_empty, list), "Results with empty list should be a list"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_document_search_with_language():
    """Test document search with language filtering."""
    question = "copyright"
    language = "pl"
    
    results = await search_documents(
        query=question,
        max_docs=5,
        document_type=DocumentType.JUDGMENT,
        language=language
    )
    
    assert isinstance(results, list), "Results should be a list"
    
    # All results should match the language filter
    for doc in results:
        assert doc.language == language, f"Language mismatch: {doc.language}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_case_insensitive_language_search():
    """Test that language search is case-insensitive."""
    question = "copyright"
    
    # Test with uppercase language code
    results_upper = await search_chunks_term(
        query=question,
        max_chunks=3,
        languages=["PL"]  # Uppercase
    )
    
    # Test with lowercase language code
    results_lower = await search_chunks_term(
        query=question,
        max_chunks=3,
        languages=["pl"]  # Lowercase
    )
    
    assert isinstance(results_upper, list), "Results with uppercase should be a list"
    assert isinstance(results_lower, list), "Results with lowercase should be a list"
    
    # Both should return same type of results (Polish documents)
    for chunk in results_upper:
        assert chunk.language == "pl", f"Language should be lowercase: {chunk.language}"
    
    for chunk in results_lower:
        assert chunk.language == "pl", f"Language should be lowercase: {chunk.language}"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_nonexistent_language():
    """Test search with non-existent language should return empty results."""
    question = "copyright"
    
    results = await search_chunks_term(
        query=question,
        max_chunks=5,
        languages=["nonexistent"]
    )
    
    assert isinstance(results, list), "Results should be a list"
    assert len(results) == 0, "Should return empty results for non-existent language"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mixed_existing_and_nonexistent_languages():
    """Test search with mix of existing and non-existent languages."""
    question = "copyright"
    languages = ["pl", "nonexistent", "en"]  # Mix of existing and non-existent
    
    results = await search_chunks_term(
        query=question,
        max_chunks=10,
        languages=languages
    )
    
    assert isinstance(results, list), "Results should be a list"
    
    # Results should only contain documents from existing languages
    if results:
        found_languages = {chunk.language for chunk in results}
        valid_languages = {"pl", "en", "uk"}  # Known languages in the database
        for lang in found_languages:
            assert lang in valid_languages, f"Found unexpected language: {lang}"
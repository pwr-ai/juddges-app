"""Retrieval module for AI Tax Search."""

from .fetch import get_documents_by_id
from .weaviate_search import (
    search_documents,
    search_documents_by_number,
    search_chunks_vector,
    search_chunks_term,
    search_chunks,
    search_documents_with_chunks,
)
from .aggregation import reciprocal_rank_fusion

__all__ = [
    "get_documents_by_id",
    "search_documents",
    "search_documents_by_number",
    "search_chunks_vector",
    "search_chunks_term",
    "search_chunks",
    "search_documents_with_chunks",
    "reciprocal_rank_fusion",
]

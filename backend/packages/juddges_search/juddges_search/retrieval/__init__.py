"""Retrieval module for Juddges Search.

Note: Vector search functionality now uses Supabase pgvector exclusively.
Legacy Weaviate search functions have been removed.
"""

from .aggregation import reciprocal_rank_fusion

__all__ = [
    "reciprocal_rank_fusion",
]

"""Retrieval module for Juddges Search.

Note: Vector search functionality uses Supabase pgvector exclusively.
"""

from .aggregation import reciprocal_rank_fusion

__all__ = [
    "reciprocal_rank_fusion",
]

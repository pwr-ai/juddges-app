"""Aggregation approaches for combining results from multiple retrieval queries.

This module provides Reciprocal Rank Fusion (RRF) for fusing/aggregating results
from multiple parallel queries into a single ranked list. This is particularly
useful when executing multiple search queries in parallel (e.g., vector and
term queries) and needing to combine their results.
"""

from ai_tax_search.models import DocumentChunk


def reciprocal_rank_fusion(
    result_lists: list[list[DocumentChunk]],
    k: int = 60
) -> list[DocumentChunk]:
    """
    Perform Reciprocal Rank Fusion (RRF) on multiple query result lists.

    RRF formula: score = sum(1 / (rank + k)) for each query where chunk appears

    This method combines results from multiple queries by:
    1. Calculating RRF score for each unique chunk (based on chunk_id + chunk_text)
    2. Keeping the chunk version with the highest individual confidence_score
    3. Sorting by RRF score (descending)

    RRF is particularly effective because:
    - It doesn't require score normalization across different query types
    - It's rank-based, so it works well with different scoring systems
    - It naturally handles queries with different result sizes
    - The k parameter controls how much weight to give to lower-ranked results

    Args:
        result_lists: List of result lists, each from a different query
        k: RRF constant (default 60, standard in literature)
            - Lower k: More weight to top results
            - Higher k: More uniform weighting across ranks

    Returns:
        List of unique DocumentChunk objects sorted by RRF score (descending)
    """
    # Build map: (chunk_id, chunk_text) -> (chunk, rrf_score, max_individual_score)
    chunk_key_to_info: dict[tuple, dict] = {}

    # Process each query's results
    for query_results in result_lists:
        # Calculate ranks within this query (1-based)
        for rank, chunk in enumerate(query_results, start=1):
            key = (chunk.chunk_id, chunk.chunk_text)
            rrf_contribution = 1.0 / (rank + k)

            if key not in chunk_key_to_info:
                chunk_key_to_info[key] = {
                    'chunk': chunk,
                    'rrf_score': rrf_contribution,
                    'max_score': chunk.confidence_score or 0.0,
                }
            else:
                # Add RRF contribution from this query
                chunk_key_to_info[key]['rrf_score'] += rrf_contribution
                # Track highest individual score (for keeping best chunk version)
                current_score = chunk.confidence_score or 0.0
                if current_score > chunk_key_to_info[key]['max_score']:
                    chunk_key_to_info[key]['max_score'] = current_score
                    chunk_key_to_info[key]['chunk'] = chunk

    # Sort by RRF score (descending)
    sorted_chunks = sorted(
        chunk_key_to_info.values(),
        key=lambda x: x['rrf_score'],
        reverse=True
    )

    # Update confidence_score to RRF score for final chunks
    fused_chunks = []
    for item in sorted_chunks:
        chunk = item['chunk']
        # Create a copy with RRF score as confidence_score
        # This preserves all other chunk properties
        fused_chunk = DocumentChunk(
            document_id=chunk.document_id,
            chunk_id=chunk.chunk_id,
            chunk_text=chunk.chunk_text,
            document_type=chunk.document_type,
            language=chunk.language,
            position=chunk.position,
            confidence_score=item['rrf_score'],  # Use RRF score
            parent_segment_id=chunk.parent_segment_id,
            segment_type=chunk.segment_type,
            cited_references=chunk.cited_references,
            tags=chunk.tags,
        )
        fused_chunks.append(fused_chunk)

    return fused_chunks

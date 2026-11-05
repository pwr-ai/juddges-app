-- =============================================================================
-- Migration: Fix search_judgments_by_embedding ef_search setting
-- =============================================================================
-- Issue #733: search_judgments_by_embedding never sets hnsw.ef_search, so it
-- caps results to 40 regardless of match_count parameter. This mirrors the
-- behavior of search_judgments_hybrid which properly sets ef_search to 100.
-- =============================================================================

-- =============================================================================
-- Step 1: Update search_judgments_by_embedding to set hnsw.ef_search like hybrid function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_judgments_by_embedding(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_jurisdiction text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    case_number text,
    title text,
    summary text,
    jurisdiction text,
    decision_date date,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- HNSW recall knob for vector branch (mirroring search_judgments_hybrid)
    PERFORM set_config('hnsw.ef_search', '100', true);

    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.summary,
        j.jurisdiction,
        j.decision_date,
        1 - (j.embedding <=> query_embedding) AS similarity
    FROM public.judgments j
    WHERE
        (filter_jurisdiction IS NULL OR j.jurisdiction = filter_jurisdiction)
        AND j.embedding IS NOT NULL
        AND (1 - (j.embedding <=> query_embedding)) > match_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_by_embedding IS
    'Semantic search using vector embeddings with cosine similarity (1024-dim BGE-M3). '
    'Sets hnsw.ef_search to 100 to return more than 40 results when requested.';

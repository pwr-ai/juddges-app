-- =============================================================================
-- search_judgments_by_embedding: set hnsw.ef_search to cover match_count (#733)
-- =============================================================================
-- This was the only vector RPC that never set hnsw.ef_search. An HNSW index
-- scan yields at most ef_search rows and the default is 40, so the RPC returned
-- at most 40 rows whatever match_count asked for (measured in production:
-- match_count 100 and 200 both returned 40).
--
-- The fix mirrors the other vector RPCs (search_chunks_by_embedding,
-- search_judgments_hybrid): a transaction-local set_config at the top of the
-- body, so nothing leaks into the caller's session. The value follows
-- match_count with a floor of 100 (the recall setting the chunk RPC uses) and
-- a ceiling of 1000, the largest value pgvector accepts.
--
-- The signature is unchanged on purpose: adding an ef_search_value parameter
-- would need DROP FUNCTION + re-GRANT and would create a PostgREST overload
-- risk for no caller that needs it today.
--
-- The judgments HNSW index (idx_judgments_embedding) is full-precision
-- `vector_cosine_ops` on the raw column, so the ORDER BY stays
-- `j.embedding <=> query_embedding` -- the halfvec cast applies only to
-- document_chunks.
--
-- Effect on callers: every caller asking for more than 40 rows now gets up to
-- match_count rows, and recall for smaller requests improves (ef_search 100 vs
-- 40). Body otherwise identical to 20260322000001.
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
    -- HNSW recall knob for this transaction (was unset -> default 40, which
    -- capped the result set at 40 rows). Must be >= match_count.
    PERFORM set_config(
        'hnsw.ef_search',
        LEAST(GREATEST(match_count, 100), 1000)::text,
        true
    );

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
    'Semantic search using vector embeddings with cosine similarity (1024-dim BGE-M3); '
    'sets hnsw.ef_search to max(match_count, 100), capped at 1000';

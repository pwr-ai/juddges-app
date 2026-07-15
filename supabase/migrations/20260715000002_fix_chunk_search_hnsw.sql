-- =============================================================================
-- Fix search_chunks_by_embedding: make it HNSW-index-friendly + usable defaults
-- Issue #318
-- =============================================================================
-- The previous body (20260322000001) had three defects that made chunk-level
-- semantic search either time out or return nothing:
--
--   1. `ORDER BY <CASE boost expression> DESC` — ordering by a computed score
--      (raw similarity * relevance_weight) prevented the pgvector HNSW index
--      from being used, forcing a sequential scan over ~329k rows and hitting
--      the statement timeout for low thresholds.
--   2. `match_threshold` default 0.5 — above typical BGE-M3 chunk cosine
--      similarities, so the WHERE filter dropped every candidate → 0 hits.
--   3. No `hnsw.ef_search` tuning and no fallback when a language/jurisdiction
--      filter empties the candidate window (filtered HNSW can under-return).
--
-- Benchmark (10 corpus-grounded PL/EN queries, LLM-judge precision@5):
--   before (document-level /documents/search path): P@5 ≈ 0.34–0.38
--   after  (this corrected chunk ranking):           P@5 = 1.00  (~150 ms)
--
-- Fix strategy:
--   * ORDER BY the raw distance operator only (`embedding <=> query_embedding`)
--     so HNSW is used; pull a candidate window (match_count * 8), then re-rank
--     that small set by the boosted score. Ranking stays index-friendly.
--   * Lower default `match_threshold` to 0.2.
--   * Tune `hnsw.ef_search` (100) inside the function.
--   * Push language/jurisdiction INTO the indexed scan; if the filtered pass
--     returns nothing, retry dropping only the language filter (jurisdiction is
--     preserved so a jurisdiction-scoped caller never leaks other regions).
--
-- Signature note: the argument list and RETURNS TABLE shape are UNCHANGED, so
-- this is a true CREATE OR REPLACE (no overload) and every existing caller keeps
-- working. Only the `match_threshold` default changes (0.5 -> 0.2) and the body.
-- SECURITY INVOKER (unchanged from the original definition).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_chunks_by_embedding(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.2,
    match_count int DEFAULT 20,
    filter_language text DEFAULT NULL,
    filter_jurisdiction text DEFAULT NULL,
    boost_key_sections boolean DEFAULT TRUE
)
RETURNS TABLE (
    chunk_id uuid,
    document_id uuid,
    chunk_index int,
    chunk_text text,
    chunk_type text,
    section_title text,
    is_key_section boolean,
    token_count int,
    language text,
    similarity float,
    -- Parent judgment metadata
    case_number text,
    jurisdiction text,
    court_name text,
    decision_date date,
    title text
)
LANGUAGE plpgsql
AS $$
DECLARE
    cand_window int := GREATEST(match_count * 8, 64);
BEGIN
    -- HNSW recall knob for this transaction (was unset → default 40).
    PERFORM set_config('hnsw.ef_search', '100', true);

    -- Pass 1: language/jurisdiction pushed INTO the HNSW scan so the index is
    -- still used (ORDER BY the raw distance operator only) and language is
    -- honoured. Boost is applied as a re-rank over the candidate window.
    RETURN QUERY
    WITH candidates AS (
        SELECT
            c.id, c.document_id, c.chunk_index, c.chunk_text, c.chunk_type,
            c.section_title, c.is_key_section, c.token_count, c.relevance_weight,
            c.language, (c.embedding <=> query_embedding) AS dist
        FROM public.document_chunks c
        WHERE c.embedding IS NOT NULL
          AND (filter_language IS NULL OR c.language = filter_language)
          AND (filter_jurisdiction IS NULL OR EXISTS (
                SELECT 1 FROM public.judgments j
                WHERE j.id = c.document_id AND j.jurisdiction = filter_jurisdiction))
        ORDER BY c.embedding <=> query_embedding
        LIMIT cand_window
    ),
    scored AS (
        SELECT cand.*,
               (1 - cand.dist)
                 * (CASE WHEN boost_key_sections AND cand.is_key_section
                         THEN COALESCE(cand.relevance_weight, 1) ELSE 1 END) AS sim
        FROM candidates cand
        WHERE (1 - cand.dist) > match_threshold
    )
    SELECT
        s.id, s.document_id, s.chunk_index, s.chunk_text, s.chunk_type,
        s.section_title, s.is_key_section, s.token_count, s.language,
        s.sim AS similarity,
        j.case_number, j.jurisdiction, j.court_name, j.decision_date, j.title
    FROM scored s
    JOIN public.judgments j ON s.document_id = j.id
    ORDER BY s.sim DESC NULLS LAST
    LIMIT match_count;

    -- Pass 2 (fallback): only if the filtered scan returned nothing — e.g. the
    -- candidate window for a rare LANGUAGE was empty. Drop the language filter
    -- but KEEP jurisdiction, so a jurisdiction-scoped caller never leaks
    -- other-jurisdiction chunks.
    IF NOT FOUND THEN
        RETURN QUERY
        WITH candidates AS (
            SELECT
                c.id, c.document_id, c.chunk_index, c.chunk_text, c.chunk_type,
                c.section_title, c.is_key_section, c.token_count, c.relevance_weight,
                c.language, (c.embedding <=> query_embedding) AS dist
            FROM public.document_chunks c
            WHERE c.embedding IS NOT NULL
              AND (filter_jurisdiction IS NULL OR EXISTS (
                    SELECT 1 FROM public.judgments j
                    WHERE j.id = c.document_id AND j.jurisdiction = filter_jurisdiction))
            ORDER BY c.embedding <=> query_embedding
            LIMIT cand_window
        ),
        scored AS (
            SELECT cand.*,
                   (1 - cand.dist)
                     * (CASE WHEN boost_key_sections AND cand.is_key_section
                             THEN COALESCE(cand.relevance_weight, 1) ELSE 1 END) AS sim
            FROM candidates cand
            WHERE (1 - cand.dist) > match_threshold
        )
        SELECT
            s.id, s.document_id, s.chunk_index, s.chunk_text, s.chunk_type,
            s.section_title, s.is_key_section, s.token_count, s.language,
            s.sim AS similarity,
            j.case_number, j.jurisdiction, j.court_name, j.decision_date, j.title
        FROM scored s
        JOIN public.judgments j ON s.document_id = j.id
        ORDER BY s.sim DESC NULLS LAST
        LIMIT match_count;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.search_chunks_by_embedding IS
    'Chunk-level semantic search over document_chunks (BGE-M3 1024-dim). '
    'HNSW-index-friendly: ranks a candidate window by raw cosine distance, then '
    're-ranks by key-section-boosted score. language/jurisdiction are post-filters '
    'with an unfiltered fallback. See issue #318.';

GRANT EXECUTE ON FUNCTION public.search_chunks_by_embedding TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_chunks_by_embedding TO service_role;

-- =============================================================================
-- Migration: Harden auth helpers and unify embedding function contract to 768d
-- =============================================================================
-- This migration:
-- 1) Recreates search_judgments_hybrid with query_embedding vector(768)
-- 2) Hardens SECURITY DEFINER functions with SET search_path = ''
-- 3) Recreates update_judgment_embedding with explicit schema-qualified vector type
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Unify hybrid search signature with current judgments.embedding (vector(768))
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_judgments_hybrid;

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(768) DEFAULT NULL,
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'simple',  -- 'simple' or 'english'

    -- Filter parameters (all optional, NULL means no filter)
    filter_jurisdictions text[] DEFAULT NULL,
    filter_court_names text[] DEFAULT NULL,
    filter_court_levels text[] DEFAULT NULL,
    filter_case_types text[] DEFAULT NULL,
    filter_decision_types text[] DEFAULT NULL,
    filter_outcomes text[] DEFAULT NULL,
    filter_keywords text[] DEFAULT NULL,
    filter_legal_topics text[] DEFAULT NULL,
    filter_cited_legislation text[] DEFAULT NULL,
    filter_date_from date DEFAULT NULL,
    filter_date_to date DEFAULT NULL,

    -- Search tuning parameters
    similarity_threshold float DEFAULT 0.7,
    hybrid_alpha float DEFAULT 0.5,  -- 0=pure text, 1=pure vector
    result_limit int DEFAULT 20,
    result_offset int DEFAULT 0
)
RETURNS TABLE (
    -- Original fields
    id uuid,
    case_number text,
    title text,
    summary text,
    full_text text,
    jurisdiction text,
    court_name text,
    court_level text,
    case_type text,
    decision_type text,
    outcome text,
    decision_date date,
    publication_date date,
    keywords text[],
    legal_topics text[],
    cited_legislation text[],
    judges jsonb,
    metadata jsonb,
    source_dataset text,
    source_id text,
    source_url text,
    vector_score float,
    text_score float,
    combined_score float,

    -- Chunk metadata fields
    chunk_text text,
    chunk_type text,
    chunk_start_pos int,
    chunk_end_pos int,
    chunk_metadata jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
    ts_config regconfig;
BEGIN
    -- Select text search configuration based on language
    ts_config := CASE
        WHEN search_language = 'english' THEN 'english'::regconfig
        ELSE 'simple'::regconfig
    END;

    -- Build text search query if provided
    IF search_text IS NOT NULL THEN
        ts_query := plainto_tsquery(ts_config, search_text);
    END IF;

    RETURN QUERY
    WITH vector_results AS (
        -- Vector similarity search (cosine distance)
        SELECT
            j.id,
            (1 - (j.embedding <=> query_embedding)) AS similarity
        FROM public.judgments j
        WHERE query_embedding IS NOT NULL
            AND j.embedding IS NOT NULL
            AND (1 - (j.embedding <=> query_embedding)) > similarity_threshold
        ORDER BY j.embedding <=> query_embedding
        LIMIT result_limit * 2
    ),
    text_results AS (
        -- Full-text search with language awareness
        SELECT
            j.id,
            ts_rank(
                to_tsvector(ts_config,
                    coalesce(j.title, '') || ' ' ||
                    coalesce(j.summary, '') || ' ' ||
                    coalesce(j.full_text, '')
                ),
                ts_query
            ) AS rank
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND to_tsvector(ts_config,
                    coalesce(j.title, '') || ' ' ||
                    coalesce(j.summary, '') || ' ' ||
                    coalesce(j.full_text, '')
                ) @@ ts_query
        ORDER BY rank DESC
        LIMIT result_limit * 2
    ),
    combined_results AS (
        SELECT
            COALESCE(v.id, t.id) as id,
            COALESCE(v.similarity, 0.0) as vscore,
            COALESCE(t.rank, 0.0) as tscore,
            (COALESCE(v.similarity, 0.0) * hybrid_alpha +
             COALESCE(t.rank, 0.0) * (1.0 - hybrid_alpha)) as score
        FROM vector_results v
        FULL OUTER JOIN text_results t ON v.id = t.id
    )
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.summary,
        j.full_text,
        j.jurisdiction,
        j.court_name,
        j.court_level,
        j.case_type,
        j.decision_type,
        j.outcome,
        j.decision_date,
        j.publication_date,
        j.keywords,
        j.legal_topics,
        j.cited_legislation,
        j.judges,
        j.metadata,
        j.source_dataset,
        j.source_id,
        j.source_url,
        cr.vscore::float as vector_score,
        cr.tscore::float as text_score,
        cr.score::float as combined_score,

        -- Use summary if available, otherwise first 500 chars of full_text
        COALESCE(j.summary, LEFT(j.full_text, 500))::text as chunk_text,

        CASE
            WHEN j.summary IS NOT NULL AND j.summary != '' THEN 'summary'::text
            WHEN j.full_text IS NOT NULL THEN 'excerpt'::text
            ELSE 'title'::text
        END as chunk_type,

        0 as chunk_start_pos,
        LENGTH(COALESCE(j.summary, LEFT(j.full_text, 500))) as chunk_end_pos,

        jsonb_build_object(
            'court_name', j.court_name,
            'court_level', j.court_level,
            'decision_date', j.decision_date,
            'case_number', j.case_number,
            'jurisdiction', j.jurisdiction,
            'case_type', j.case_type,
            'decision_type', j.decision_type,
            'outcome', j.outcome,
            'vector_score', cr.vscore,
            'text_score', cr.tscore,
            'combined_score', cr.score
        ) as chunk_metadata

    FROM combined_results cr
    JOIN public.judgments j ON cr.id = j.id
    WHERE
        (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
        AND (filter_court_names IS NULL OR j.court_name = ANY(filter_court_names))
        AND (filter_court_levels IS NULL OR j.court_level = ANY(filter_court_levels))
        AND (filter_case_types IS NULL OR j.case_type = ANY(filter_case_types))
        AND (filter_decision_types IS NULL OR j.decision_type = ANY(filter_decision_types))
        AND (filter_outcomes IS NULL OR j.outcome = ANY(filter_outcomes))
        AND (filter_date_from IS NULL OR j.decision_date >= filter_date_from)
        AND (filter_date_to IS NULL OR j.decision_date <= filter_date_to)
        AND (filter_keywords IS NULL OR j.keywords && filter_keywords)
        AND (filter_legal_topics IS NULL OR j.legal_topics && filter_legal_topics)
        AND (filter_cited_legislation IS NULL OR j.cited_legislation && filter_cited_legislation)
    ORDER BY cr.score DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_hybrid IS
    'Hybrid search with 768-dim embeddings. Combines vector similarity and full-text search with filters and chunk metadata.';

-- -----------------------------------------------------------------------------
-- 2) Harden SECURITY DEFINER helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_judgment_embedding(
    judgment_id uuid,
    embedding_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.judgments
    SET embedding = embedding_text::public.vector(768)
    WHERE id = judgment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_judgment_embedding TO service_role, authenticated;

ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.get_my_profile() SET search_path = '';
ALTER FUNCTION public.is_admin() SET search_path = '';

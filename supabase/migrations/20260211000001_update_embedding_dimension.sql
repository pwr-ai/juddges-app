-- =============================================================================
-- Migration: Update Embedding Dimension from 1536 to 768
-- =============================================================================
-- Changes vector embedding column from OpenAI ada-002 (1536-dim) to
-- Sentence Transformers multilingual-mpnet-base-v2 (768-dim)
-- =============================================================================

-- Step 1: Drop existing vector index (requires rebuild with new dimension)
DROP INDEX IF EXISTS idx_judgments_embedding;

-- Step 2: Alter column to new dimension
-- Note: This will clear existing embeddings as they're incompatible
ALTER TABLE public.judgments
    ALTER COLUMN embedding TYPE vector(768);

-- Step 3: Recreate vector similarity index with new dimension
CREATE INDEX idx_judgments_embedding ON public.judgments
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Step 4: Update comments
COMMENT ON COLUMN public.judgments.embedding IS
    'Vector embedding for semantic search (768-dim sentence-transformers-paraphrase-multilingual-mpnet-base-v2)';

-- Step 5: Update search functions to use correct dimension
-- Note: The search functions accept vector(1536) parameter - need to update

CREATE OR REPLACE FUNCTION public.search_judgments_by_embedding(
    query_embedding vector(768),  -- Changed from 1536 to 768
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
    'Semantic search using vector embeddings with cosine similarity (768-dim sentence-transformers)';

-- Step 6: Update hybrid search function
CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(768) DEFAULT NULL,  -- Changed from 1536 to 768
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'simple',

    -- Filter parameters
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

    -- Search tuning
    similarity_threshold float DEFAULT 0.7,
    hybrid_alpha float DEFAULT 0.5,
    result_limit int DEFAULT 20,
    result_offset int DEFAULT 0
)
RETURNS TABLE (
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
    combined_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
    ts_config regconfig;
BEGIN
    ts_config := CASE
        WHEN search_language = 'english' THEN 'english'::regconfig
        ELSE 'simple'::regconfig
    END;

    IF search_text IS NOT NULL THEN
        ts_query := plainto_tsquery(ts_config, search_text);
    END IF;

    RETURN QUERY
    WITH vector_results AS (
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
        cr.vscore as vector_score,
        cr.tscore as text_score,
        cr.score as combined_score
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
    'Hybrid search with 768-dim sentence-transformers embeddings. Combines vector similarity and full-text search.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

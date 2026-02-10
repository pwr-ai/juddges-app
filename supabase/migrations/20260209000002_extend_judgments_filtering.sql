-- =============================================================================
-- Migration: Extend judgments table for enhanced filtering and Polish language support
-- =============================================================================
-- This migration enhances the judgments table with:
-- - Additional indexes for rich server-side filtering (10+ filter types)
-- - Language-aware full-text search (Polish and English)
-- - Hybrid search function with comprehensive filters
-- - Faceting function for dynamic filter UI with real-time counts
-- =============================================================================

-- =============================================================================
-- STEP 1: Create Missing Indexes for Filterable Fields
-- =============================================================================

-- Simple B-tree indexes for exact matches (partial indexes to reduce size)
CREATE INDEX IF NOT EXISTS idx_judgments_case_type ON public.judgments(case_type)
  WHERE case_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_decision_type ON public.judgments(decision_type)
  WHERE decision_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_outcome ON public.judgments(outcome)
  WHERE outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_court_level ON public.judgments(court_level)
  WHERE court_level IS NOT NULL;

-- GIN index for cited_legislation array (was missing in initial migration)
CREATE INDEX IF NOT EXISTS idx_judgments_cited_legislation ON public.judgments
  USING gin(cited_legislation);

-- Composite indexes for common filter combinations
-- Jurisdiction + Court Level + Date (for filtering by court hierarchy over time)
CREATE INDEX IF NOT EXISTS idx_judgments_jurisdiction_court_level_date ON public.judgments(
    jurisdiction,
    court_level,
    decision_date DESC
) WHERE decision_date IS NOT NULL;

-- Case Type + Date (for filtering case types over time)
CREATE INDEX IF NOT EXISTS idx_judgments_case_type_date ON public.judgments(
    case_type,
    decision_date DESC
) WHERE decision_date IS NOT NULL AND case_type IS NOT NULL;

COMMENT ON INDEX idx_judgments_case_type IS 'Index for filtering by case type (Criminal, Civil, Administrative)';
COMMENT ON INDEX idx_judgments_decision_type IS 'Index for filtering by decision type (Judgment, Order, Ruling)';
COMMENT ON INDEX idx_judgments_outcome IS 'Index for filtering by case outcome (Granted, Dismissed, Remanded)';
COMMENT ON INDEX idx_judgments_court_level IS 'Index for filtering by court hierarchy level';
COMMENT ON INDEX idx_judgments_cited_legislation IS 'GIN index for filtering by cited legislation (array overlap)';
COMMENT ON INDEX idx_judgments_jurisdiction_court_level_date IS 'Composite index for jurisdiction + court level + date filtering';
COMMENT ON INDEX idx_judgments_case_type_date IS 'Composite index for case type + date filtering';

-- =============================================================================
-- STEP 2: Add Polish Language Full-Text Search
-- =============================================================================

-- Drop existing English-only full-text search index
DROP INDEX IF EXISTS public.idx_judgments_full_text_search;

-- Create Polish text search index (for Polish judgments)
-- Uses PostgreSQL's built-in Polish stemming and stop words
CREATE INDEX idx_judgments_full_text_search_pl ON public.judgments
    USING gin(
        to_tsvector('polish',
            coalesce(title, '') || ' ' ||
            coalesce(summary, '') || ' ' ||
            coalesce(full_text, '')
        )
    )
    WHERE jurisdiction = 'PL' OR metadata->>'language' = 'pl';

-- Create English text search index (for UK judgments)
CREATE INDEX idx_judgments_full_text_search_en ON public.judgments
    USING gin(
        to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(summary, '') || ' ' ||
            coalesce(full_text, '')
        )
    )
    WHERE jurisdiction = 'UK' OR metadata->>'language' = 'en';

COMMENT ON INDEX idx_judgments_full_text_search_pl IS 'Polish language full-text search index with Polish stemming';
COMMENT ON INDEX idx_judgments_full_text_search_en IS 'English language full-text search index with English stemming';

-- =============================================================================
-- STEP 3: Create Hybrid Search Function with Rich Filters
-- =============================================================================

-- Drop existing search function if it exists (to allow recreation)
DROP FUNCTION IF EXISTS public.search_judgments_hybrid(
    vector(1536), text, text,
    text[], text[], text[], text[], text[], text[], text[], text[], text[],
    date, date,
    float, float, int, int
);

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(1536) DEFAULT NULL,
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'polish',  -- 'polish' or 'english'

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
    -- Select text search configuration based on language
    ts_config := CASE
        WHEN search_language = 'english' THEN 'english'::regconfig
        ELSE 'polish'::regconfig
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
        LIMIT result_limit * 2  -- Fetch 2x to ensure enough results after filtering
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
        -- Reciprocal Rank Fusion scoring (RRF)
        -- Combines vector and text results with configurable weighting
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
        -- Apply all filters (NULL means no filter, all pass)
        (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
        AND (filter_court_names IS NULL OR j.court_name = ANY(filter_court_names))
        AND (filter_court_levels IS NULL OR j.court_level = ANY(filter_court_levels))
        AND (filter_case_types IS NULL OR j.case_type = ANY(filter_case_types))
        AND (filter_decision_types IS NULL OR j.decision_type = ANY(filter_decision_types))
        AND (filter_outcomes IS NULL OR j.outcome = ANY(filter_outcomes))
        AND (filter_date_from IS NULL OR j.decision_date >= filter_date_from)
        AND (filter_date_to IS NULL OR j.decision_date <= filter_date_to)
        -- Array overlap filters (&&): TRUE if any element matches
        AND (filter_keywords IS NULL OR j.keywords && filter_keywords)
        AND (filter_legal_topics IS NULL OR j.legal_topics && filter_legal_topics)
        AND (filter_cited_legislation IS NULL OR j.cited_legislation && filter_cited_legislation)
    ORDER BY cr.score DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_hybrid IS
    'Hybrid search combining vector similarity and full-text search with comprehensive filtering. ' ||
    'Supports Polish and English language stemming. Uses Reciprocal Rank Fusion for result scoring. ' ||
    'Parameters: query_embedding (vector search), search_text (full-text), search_language (polish/english), ' ||
    'filter_* (11 filter types), similarity_threshold (vector cutoff), hybrid_alpha (0=text only, 1=vector only), ' ||
    'result_limit/result_offset (pagination).';

-- =============================================================================
-- STEP 4: Create Faceting Function for Dynamic Filter Counts
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_judgment_facets(text[], date, date);

CREATE OR REPLACE FUNCTION public.get_judgment_facets(
    -- Optional pre-filters to compute facets within a subset
    pre_filter_jurisdictions text[] DEFAULT NULL,
    pre_filter_date_from date DEFAULT NULL,
    pre_filter_date_to date DEFAULT NULL
)
RETURNS TABLE (
    facet_type text,
    facet_value text,
    facet_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_judgments AS (
        SELECT * FROM public.judgments j
        WHERE
            (pre_filter_jurisdictions IS NULL OR j.jurisdiction = ANY(pre_filter_jurisdictions))
            AND (pre_filter_date_from IS NULL OR j.decision_date >= pre_filter_date_from)
            AND (pre_filter_date_to IS NULL OR j.decision_date <= pre_filter_date_to)
    )
    -- Aggregate facets from filtered set
    -- Jurisdiction facet
    SELECT 'jurisdiction'::text, jurisdiction::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE jurisdiction IS NOT NULL
    GROUP BY jurisdiction

    UNION ALL
    -- Court level facet
    SELECT 'court_level'::text, court_level::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE court_level IS NOT NULL
    GROUP BY court_level

    UNION ALL
    -- Court name facet
    SELECT 'court_name'::text, court_name::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE court_name IS NOT NULL
    GROUP BY court_name

    UNION ALL
    -- Case type facet
    SELECT 'case_type'::text, case_type::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE case_type IS NOT NULL
    GROUP BY case_type

    UNION ALL
    -- Decision type facet
    SELECT 'decision_type'::text, decision_type::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE decision_type IS NOT NULL
    GROUP BY decision_type

    UNION ALL
    -- Outcome facet
    SELECT 'outcome'::text, outcome::text, COUNT(*)::bigint
    FROM filtered_judgments
    WHERE outcome IS NOT NULL
    GROUP BY outcome

    UNION ALL
    -- Keyword facet (unnest array, count occurrences, filter by frequency)
    SELECT 'keyword'::text, keyword, COUNT(*)::bigint
    FROM filtered_judgments, unnest(keywords) keyword
    WHERE keywords IS NOT NULL
    GROUP BY keyword
    HAVING COUNT(*) > 1  -- Only show keywords with 2+ occurrences

    UNION ALL
    -- Legal topic facet (unnest array, count occurrences, filter by frequency)
    SELECT 'legal_topic'::text, topic, COUNT(*)::bigint
    FROM filtered_judgments, unnest(legal_topics) topic
    WHERE legal_topics IS NOT NULL
    GROUP BY topic
    HAVING COUNT(*) > 1  -- Only show topics with 2+ occurrences

    ORDER BY facet_type, facet_count DESC;
END;
$$;

COMMENT ON FUNCTION public.get_judgment_facets IS
    'Returns aggregated counts for each filter option. Used to display filter counts in UI (e.g., "Criminal (234)"). ' ||
    'Supports optional pre-filtering by jurisdiction and date range to compute facets within a subset. ' ||
    'Output format: (facet_type, facet_value, facet_count) e.g., ("case_type", "Criminal", 1234).';

-- =============================================================================
-- STEP 5: Performance Optimization - Analyze Tables
-- =============================================================================

-- Update statistics for query planner optimization
ANALYZE public.judgments;

-- =============================================================================
-- Verification Queries (for testing after migration)
-- =============================================================================

-- Test 1: Verify all indexes exist
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'judgments' AND schemaname = 'public'
-- ORDER BY indexname;

-- Test 2: Test Polish full-text search
-- SELECT id, title, summary
-- FROM judgments
-- WHERE to_tsvector('polish', full_text) @@ plainto_tsquery('polish', 'prawo karne')
-- LIMIT 5;

-- Test 3: Test hybrid search function with filters
-- SELECT id, title, case_type, court_level, combined_score
-- FROM search_judgments_hybrid(
--     search_text := 'prawa człowieka',
--     search_language := 'polish',
--     filter_jurisdictions := ARRAY['PL'],
--     filter_case_types := ARRAY['Criminal'],
--     filter_date_from := '2023-01-01',
--     filter_date_to := '2024-12-31',
--     hybrid_alpha := 0.7,
--     result_limit := 10
-- );

-- Test 4: Test faceting function
-- SELECT facet_type, facet_value, facet_count
-- FROM get_judgment_facets(
--     pre_filter_jurisdictions := ARRAY['PL']
-- )
-- WHERE facet_type = 'case_type'
-- ORDER BY facet_count DESC;

-- Test 5: Check index usage with EXPLAIN
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM judgments
-- WHERE case_type = 'Criminal'
--   AND jurisdiction = 'PL'
--   AND decision_date >= '2023-01-01'
-- ORDER BY decision_date DESC
-- LIMIT 20;
-- Should show "Index Scan using idx_judgments_case_type_date" or similar

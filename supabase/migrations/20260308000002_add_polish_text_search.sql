-- =============================================================================
-- Migration: Add Polish text search configuration
-- =============================================================================
-- PostgreSQL doesn't ship with a Polish stemmer, and Supabase doesn't allow
-- installing system-level hunspell dictionaries. This migration creates a
-- practical Polish text search configuration using:
--
-- 1. unaccent extension: normalizes diacritics (ą→a, ć→c, ę→e, ł→l, etc.)
-- 2. simple dictionary: tokenization without stemming
-- 3. GIN index for Polish documents
--
-- This enables Polish queries to match documents regardless of diacritics,
-- covering the most common search failure (e.g., "odpowiedzialnosc" matching
-- "odpowiedzialność"). Full morphological stemming would require hunspell.
--
-- The search function is updated to auto-detect language from jurisdiction.
-- =============================================================================

-- 1) Enable unaccent extension (idempotent)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2) Create Polish text search configuration
-- Uses simple tokenizer + unaccent filter for diacritic normalization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_ts_config WHERE cfgname = 'polish'
    ) THEN
        -- Create config based on 'simple' (tokenize without stemming)
        CREATE TEXT SEARCH CONFIGURATION public.polish (COPY = simple);

        -- Add unaccent as a filter so ą matches a, ć matches c, etc.
        ALTER TEXT SEARCH CONFIGURATION public.polish
            ALTER MAPPING FOR asciiword, asciihword, hword_asciipart
            WITH unaccent, simple;

        ALTER TEXT SEARCH CONFIGURATION public.polish
            ALTER MAPPING FOR word, hword, hword_part
            WITH unaccent, simple;
    END IF;
END $$;

COMMENT ON TEXT SEARCH CONFIGURATION public.polish IS
    'Polish text search: unaccent + simple tokenization. '
    'Handles diacritic normalization (ą→a, ć→c). No morphological stemming.';

-- 3) Add a GIN index specifically for Polish documents using the new config
CREATE INDEX IF NOT EXISTS idx_judgments_fts_polish
    ON public.judgments
    USING gin(
        to_tsvector('public.polish',
            coalesce(title, '') || ' ' ||
            coalesce(summary, '') || ' ' ||
            coalesce(full_text, '')
        )
    )
    WHERE jurisdiction = 'PL';

-- 4) Update search_judgments_hybrid to auto-detect language from jurisdiction
-- When search_language='auto', use 'english' for UK docs and 'polish' for PL docs
DROP FUNCTION IF EXISTS public.search_judgments_hybrid;

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(768) DEFAULT NULL,
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'auto',  -- 'auto', 'english', 'polish', or 'simple'

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
    similarity_threshold float DEFAULT 0.5,
    hybrid_alpha float DEFAULT 0.5,  -- 0=pure text, 1=pure vector
    result_limit int DEFAULT 20,
    result_offset int DEFAULT 0,
    rrf_k int DEFAULT 60  -- RRF constant: lower=more weight to top results
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
    fetch_limit int;
BEGIN
    -- Set HNSW parameters for this query
    PERFORM set_config('hnsw.ef_search', '100', true);

    fetch_limit := result_limit * 3;

    -- Resolve text search configuration
    -- 'auto' selects based on jurisdiction filter or defaults to 'english'
    ts_config := CASE
        WHEN search_language = 'english' THEN 'english'::regconfig
        WHEN search_language = 'polish' THEN 'public.polish'::regconfig
        WHEN search_language = 'auto' AND filter_jurisdictions = ARRAY['PL']::text[]
            THEN 'public.polish'::regconfig
        WHEN search_language = 'auto' THEN 'english'::regconfig
        ELSE 'simple'::regconfig
    END;

    -- Build text search query using websearch_to_tsquery
    IF search_text IS NOT NULL AND search_text != '' THEN
        ts_query := websearch_to_tsquery(ts_config, search_text);
    END IF;

    RETURN QUERY
    WITH
    -- Pre-filter judgments that match any active filters
    filtered_judgments AS (
        SELECT j.id
        FROM public.judgments j
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
    ),

    -- Vector similarity search (cosine distance)
    vector_results AS (
        SELECT
            j.id,
            (1 - (j.embedding <=> query_embedding)) AS similarity,
            ROW_NUMBER() OVER (ORDER BY j.embedding <=> query_embedding) AS vrank
        FROM public.judgments j
        INNER JOIN filtered_judgments fj ON fj.id = j.id
        WHERE query_embedding IS NOT NULL
            AND j.embedding IS NOT NULL
            AND (1 - (j.embedding <=> query_embedding)) > similarity_threshold
        ORDER BY j.embedding <=> query_embedding
        LIMIT fetch_limit
    ),

    -- Full-text search with per-document language awareness
    -- For 'auto' mode, search both English and Polish configs and union results
    text_results AS (
        SELECT
            j.id,
            ts_rank_cd(
                to_tsvector(
                    CASE WHEN j.jurisdiction = 'PL' THEN 'public.polish'::regconfig
                         ELSE 'english'::regconfig
                    END,
                    coalesce(j.title, '') || ' ' ||
                    coalesce(j.summary, '') || ' ' ||
                    coalesce(j.full_text, '')
                ),
                ts_query,
                32  -- normalization: bounded 0-1
            ) AS rank,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector(
                        CASE WHEN j.jurisdiction = 'PL' THEN 'public.polish'::regconfig
                             ELSE 'english'::regconfig
                        END,
                        coalesce(j.title, '') || ' ' ||
                        coalesce(j.summary, '') || ' ' ||
                        coalesce(j.full_text, '')
                    ),
                    ts_query,
                    32
                ) DESC
            ) AS trank
        FROM public.judgments j
        INNER JOIN filtered_judgments fj ON fj.id = j.id
        WHERE search_text IS NOT NULL
            AND ts_query IS NOT NULL
            AND to_tsvector(
                    CASE WHEN j.jurisdiction = 'PL' THEN 'public.polish'::regconfig
                         ELSE 'english'::regconfig
                    END,
                    coalesce(j.title, '') || ' ' ||
                    coalesce(j.summary, '') || ' ' ||
                    coalesce(j.full_text, '')
                ) @@ ts_query
        ORDER BY rank DESC
        LIMIT fetch_limit
    ),

    -- Trigram fuzzy fallback: activates when FTS returns zero results
    fuzzy_results AS (
        SELECT
            j.id,
            GREATEST(
                similarity(j.title, search_text),
                similarity(j.summary, search_text)
            ) AS sim,
            ROW_NUMBER() OVER (
                ORDER BY GREATEST(
                    similarity(j.title, search_text),
                    similarity(j.summary, search_text)
                ) DESC
            ) AS frank
        FROM public.judgments j
        INNER JOIN filtered_judgments fj ON fj.id = j.id
        WHERE search_text IS NOT NULL
            AND ts_query IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM text_results LIMIT 1)
            AND (
                similarity(j.title, search_text) > 0.15
                OR similarity(j.summary, search_text) > 0.15
            )
        ORDER BY sim DESC
        LIMIT fetch_limit
    ),

    -- Reciprocal Rank Fusion
    rrf_scores AS (
        SELECT
            doc_id,
            SUM(rrf_contribution) AS rrf_score,
            MAX(vscore) AS vscore,
            MAX(tscore) AS tscore
        FROM (
            SELECT v.id AS doc_id,
                   1.0 / (rrf_k + v.vrank) AS rrf_contribution,
                   v.similarity AS vscore,
                   0.0::float AS tscore
            FROM vector_results v

            UNION ALL

            SELECT t.id AS doc_id,
                   1.0 / (rrf_k + t.trank) AS rrf_contribution,
                   0.0::float AS vscore,
                   t.rank AS tscore
            FROM text_results t

            UNION ALL

            SELECT f.id AS doc_id,
                   0.5 / (rrf_k + f.frank) AS rrf_contribution,
                   0.0::float AS vscore,
                   f.sim AS tscore
            FROM fuzzy_results f
        ) sub
        GROUP BY doc_id
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
        rrf.vscore::float AS vector_score,
        rrf.tscore::float AS text_score,
        rrf.rrf_score::float AS combined_score,

        -- ts_headline with per-document language config
        CASE
            WHEN ts_query IS NOT NULL AND (j.summary IS NOT NULL AND j.summary != '') THEN
                ts_headline(
                    CASE WHEN j.jurisdiction = 'PL' THEN 'public.polish'::regconfig
                         ELSE 'english'::regconfig
                    END,
                    j.summary, ts_query,
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... ')
            WHEN ts_query IS NOT NULL AND j.full_text IS NOT NULL THEN
                ts_headline(
                    CASE WHEN j.jurisdiction = 'PL' THEN 'public.polish'::regconfig
                         ELSE 'english'::regconfig
                    END,
                    LEFT(j.full_text, 5000), ts_query,
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... ')
            ELSE
                COALESCE(j.summary, LEFT(j.full_text, 500))
        END::text AS chunk_text,

        CASE
            WHEN ts_query IS NOT NULL THEN 'highlight'::text
            WHEN j.summary IS NOT NULL AND j.summary != '' THEN 'summary'::text
            WHEN j.full_text IS NOT NULL THEN 'excerpt'::text
            ELSE 'title'::text
        END AS chunk_type,

        0 AS chunk_start_pos,
        LENGTH(COALESCE(j.summary, LEFT(j.full_text, 500))) AS chunk_end_pos,

        jsonb_build_object(
            'court_name', j.court_name,
            'court_level', j.court_level,
            'decision_date', j.decision_date,
            'case_number', j.case_number,
            'jurisdiction', j.jurisdiction,
            'case_type', j.case_type,
            'decision_type', j.decision_type,
            'outcome', j.outcome,
            'vector_score', rrf.vscore,
            'text_score', rrf.tscore,
            'rrf_score', rrf.rrf_score
        ) AS chunk_metadata

    FROM rrf_scores rrf
    JOIN public.judgments j ON rrf.doc_id = j.id
    ORDER BY rrf.rrf_score DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_hybrid IS
    'Hybrid search with RRF fusion, per-document language-aware FTS (English/Polish), '
    'fuzzy fallback, ts_headline snippets, and 768-dim embeddings.';

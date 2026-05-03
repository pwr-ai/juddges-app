-- =============================================================================
-- Migration: Add configurable ef_search to search_judgments_hybrid
-- =============================================================================
-- Allows callers to tune HNSW recall vs speed via ef_search_value parameter.
-- Default remains 100 (unchanged behavior).
--
-- Note: CREATE OR REPLACE only matches by full signature, so adding a new
-- parameter would create a second overload instead of replacing. Drop the
-- prior 19-arg version first so the COMMENT below is unambiguous.
-- =============================================================================

DROP FUNCTION IF EXISTS public.search_judgments_hybrid(
    vector, text, text,
    text[], text[], text[], text[], text[], text[],
    text[], text[], text[],
    date, date,
    double precision, double precision,
    int, int, int
);

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(768) DEFAULT NULL,
    search_text text DEFAULT NULL,
    search_language text DEFAULT 'auto',  -- 'auto', 'english', 'polish'

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
    rrf_k int DEFAULT 60,  -- RRF constant: lower=more weight to top results
    ef_search_value int DEFAULT 100
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
    ts_query_en tsquery;
    ts_query_pl tsquery;
    fetch_limit int;
BEGIN
    -- HNSW recall knob for vector branch
    PERFORM set_config('hnsw.ef_search', ef_search_value::text, true);

    fetch_limit := GREATEST(result_limit * 3, result_limit);

    IF search_text IS NOT NULL AND search_text != '' THEN
        ts_query_en := websearch_to_tsquery('english'::regconfig, search_text);
        ts_query_pl := websearch_to_tsquery('public.polish'::regconfig, search_text);
    END IF;

    RETURN QUERY
    WITH
    -- Vector similarity search (cosine distance)
    vector_results AS (
        SELECT
            j.id,
            (1 - (j.embedding <=> query_embedding)) AS similarity,
            ROW_NUMBER() OVER (ORDER BY j.embedding <=> query_embedding) AS vrank
        FROM public.judgments j
        WHERE query_embedding IS NOT NULL
            AND j.embedding IS NOT NULL
            AND (1 - (j.embedding <=> query_embedding)) > similarity_threshold
            AND (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
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
        ORDER BY j.embedding <=> query_embedding
        LIMIT fetch_limit
    ),

    -- English text branch (index-friendly via jurisdiction='UK')
english_hits AS (
        SELECT
            j.id AS doc_id,
            ts_rank_cd(
                to_tsvector(
                    'english'::regconfig,
                    coalesce(j.title, '') || ' ' || coalesce(j.summary, '')
                ),
                ts_query_en,
                32
            ) AS rank
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND ts_query_en IS NOT NULL
            AND search_language IN ('english', 'auto')
            AND j.jurisdiction = 'UK'
            AND (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
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
            AND to_tsvector(
                'english'::regconfig,
                coalesce(j.title, '') || ' ' ||
                coalesce(j.summary, '') || ' ' ||
                coalesce(j.full_text, '')
            ) @@ ts_query_en
        ORDER BY rank DESC
        LIMIT fetch_limit
    ),

    -- Polish text branch (index-friendly via jurisdiction='PL')
polish_hits AS (
        SELECT
            j.id AS doc_id,
            ts_rank_cd(
                to_tsvector(
                    'public.polish'::regconfig,
                    coalesce(j.title, '') || ' ' || coalesce(j.summary, '')
                ),
                ts_query_pl,
                32
            ) AS rank
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND ts_query_pl IS NOT NULL
            AND search_language IN ('polish', 'auto')
            AND j.jurisdiction = 'PL'
            AND (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
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
            AND to_tsvector(
                'public.polish'::regconfig,
                coalesce(j.title, '') || ' ' ||
                coalesce(j.summary, '') || ' ' ||
                coalesce(j.full_text, '')
            ) @@ ts_query_pl
        ORDER BY rank DESC
        LIMIT fetch_limit
    ),

text_candidates AS (
        SELECT eh.doc_id, eh.rank FROM english_hits eh
        UNION ALL
        SELECT ph.doc_id, ph.rank FROM polish_hits ph
    ),

    text_results AS (
        SELECT
            tc.doc_id AS id,
            tc.rank,
            ROW_NUMBER() OVER (ORDER BY tc.rank DESC, tc.doc_id) AS trank
        FROM text_candidates tc
        ORDER BY tc.rank DESC, tc.doc_id
        LIMIT fetch_limit
    ),

    -- Trigram fuzzy fallback: only when text branch is empty
    fuzzy_results AS (
        SELECT
            j.id,
            GREATEST(
                similarity(coalesce(j.title, ''), search_text),
                similarity(LEFT(coalesce(j.summary, ''), 1200), search_text)
            ) AS sim,
            ROW_NUMBER() OVER (
                ORDER BY GREATEST(
                    similarity(coalesce(j.title, ''), search_text),
                    similarity(LEFT(coalesce(j.summary, ''), 1200), search_text)
                ) DESC
            ) AS frank
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM text_results LIMIT 1)
            -- Guardrails to keep typo fallback cheap and avoid pathological inputs
            AND char_length(search_text) BETWEEN 2 AND 40
            AND search_text ~ '[[:space:]]'
            AND search_text ~ '^[[:alnum:][:space:]ąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+$'
            AND (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
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
            AND (
                similarity(coalesce(j.title, ''), search_text) > 0.15
                OR similarity(LEFT(coalesce(j.summary, ''), 1200), search_text) > 0.15
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

        CASE
            WHEN j.jurisdiction = 'PL'
                 AND ts_query_pl IS NOT NULL
                 AND j.summary IS NOT NULL
                 AND j.summary != ''
            THEN ts_headline(
                'public.polish'::regconfig,
                j.summary,
                ts_query_pl,
                'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... '
            )
            WHEN j.jurisdiction = 'UK'
                 AND ts_query_en IS NOT NULL
                 AND j.summary IS NOT NULL
                 AND j.summary != ''
            THEN ts_headline(
                'english'::regconfig,
                j.summary,
                ts_query_en,
                'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... '
            )
            WHEN j.summary IS NOT NULL AND j.summary != ''
            THEN j.summary
            ELSE COALESCE(LEFT(j.full_text, 500), j.title)
        END::text AS chunk_text,

        CASE
            WHEN (j.jurisdiction = 'PL' AND ts_query_pl IS NOT NULL)
              OR (j.jurisdiction = 'UK' AND ts_query_en IS NOT NULL)
            THEN 'highlight'::text
            WHEN j.summary IS NOT NULL AND j.summary != '' THEN 'summary'::text
            WHEN j.full_text IS NOT NULL THEN 'excerpt'::text
            ELSE 'title'::text
        END AS chunk_type,

        0 AS chunk_start_pos,
        LENGTH(COALESCE(j.summary, LEFT(j.full_text, 500), j.title, '')) AS chunk_end_pos,

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
    'Hybrid search with configurable ef_search for HNSW recall tuning, '
    'language-specific index-friendly text branches, '
    'summary-weighted ranking, fuzzy fallback, and RRF fusion.';

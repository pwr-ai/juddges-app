-- =============================================================================
-- Migration: Optimize short broad query latency
-- =============================================================================
-- Root causes observed after previous optimization:
-- 1) very short/broad text queries (e.g., "law", "judgment") still scan/rank
--    against title+summary+full_text, which is slower than needed
-- 2) we already rank on title+summary, so matching on compact text is sufficient
--    for vague 1-2 term queries and significantly faster
--
-- This migration keeps the API contract unchanged while:
-- - adding compact FTS indexes on title+summary (UK/PL)
-- - routing short (1-2 term) text queries to compact match condition
-- - preserving typo fallback, vector search, and response schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_judgments_title_trgm_gist
    ON public.judgments USING gist (title gist_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_judgments_summary_trgm_gist
    ON public.judgments USING gist (summary gist_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_judgments_fts_english_compact
    ON public.judgments
    USING gin(
        to_tsvector(
            'english'::regconfig,
            coalesce(title, '') || ' ' || coalesce(summary, '')
        )
    )
    WHERE jurisdiction = 'UK';

CREATE INDEX IF NOT EXISTS idx_judgments_fts_polish_compact
    ON public.judgments
    USING gin(
        to_tsvector(
            'public.polish'::regconfig,
            coalesce(title, '') || ' ' || coalesce(summary, '')
        )
    )
    WHERE jurisdiction = 'PL';

DROP FUNCTION IF EXISTS public.search_judgments_hybrid;

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
    ts_query_en tsquery;
    ts_query_pl tsquery;
    fetch_limit int;
    query_term_count int;
    normalized_search text;
    use_compact_fts boolean;
    is_broad_vague_query boolean;
    has_structured_filters boolean;
BEGIN
    -- HNSW recall knob for vector branch
    PERFORM set_config('hnsw.ef_search', '100', true);

    IF search_text IS NOT NULL AND search_text != '' THEN
        ts_query_en := websearch_to_tsquery('english'::regconfig, search_text);
        ts_query_pl := websearch_to_tsquery('public.polish'::regconfig, search_text);
        query_term_count := COALESCE(
            array_length(regexp_split_to_array(trim(search_text), '\s+'), 1),
            0
        );
        normalized_search := lower(trim(search_text));
        has_structured_filters := (
            (filter_jurisdictions IS NOT NULL AND cardinality(filter_jurisdictions) > 0)
            OR (filter_court_names IS NOT NULL AND cardinality(filter_court_names) > 0)
            OR (filter_court_levels IS NOT NULL AND cardinality(filter_court_levels) > 0)
            OR (filter_case_types IS NOT NULL AND cardinality(filter_case_types) > 0)
            OR (filter_decision_types IS NOT NULL AND cardinality(filter_decision_types) > 0)
            OR (filter_outcomes IS NOT NULL AND cardinality(filter_outcomes) > 0)
            OR (filter_keywords IS NOT NULL AND cardinality(filter_keywords) > 0)
            OR (filter_legal_topics IS NOT NULL AND cardinality(filter_legal_topics) > 0)
            OR (filter_cited_legislation IS NOT NULL AND cardinality(filter_cited_legislation) > 0)
            OR filter_date_from IS NOT NULL
            OR filter_date_to IS NOT NULL
        );
        is_broad_vague_query := normalized_search IN (
            'law',
            'court',
            'case',
            'court case',
            'judgment',
            'legal',
            'wyrok',
            'orzeczenie',
            'sąd',
            'sprawa'
        );
        use_compact_fts := NOT has_structured_filters AND (
            is_broad_vague_query
            OR (query_embedding IS NULL AND query_term_count BETWEEN 2 AND 3)
        );
    ELSE
        query_term_count := 0;
        normalized_search := '';
        is_broad_vague_query := false;
        has_structured_filters := false;
        use_compact_fts := false;
    END IF;

    -- Adaptive candidate fanout:
    -- - Default to 2x for better latency on text-heavy and filtered searches.
    -- - Keep 3x only for vector-heavy unconstrained paths where extra candidates help recall.
    fetch_limit := GREATEST(result_limit * 2, result_limit);
    IF query_embedding IS NOT NULL THEN
        IF search_text IS NULL OR search_text = '' THEN
            fetch_limit := GREATEST(result_limit * 3, result_limit);
        ELSIF NOT has_structured_filters AND query_term_count >= 3 THEN
            fetch_limit := GREATEST(result_limit * 3, result_limit);
        END IF;
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
            AND (
                (
                    use_compact_fts
                    AND to_tsvector(
                        'english'::regconfig,
                        coalesce(j.title, '') || ' ' || coalesce(j.summary, '')
                    ) @@ ts_query_en
                )
                OR
                (
                    NOT use_compact_fts
                    AND to_tsvector(
                        'english'::regconfig,
                        coalesce(j.title, '') || ' ' ||
                        coalesce(j.summary, '') || ' ' ||
                        coalesce(j.full_text, '')
                    ) @@ ts_query_en
                )
            )
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
            AND (
                (
                    use_compact_fts
                    AND to_tsvector(
                        'public.polish'::regconfig,
                        coalesce(j.title, '') || ' ' || coalesce(j.summary, '')
                    ) @@ ts_query_pl
                )
                OR
                (
                    NOT use_compact_fts
                    AND to_tsvector(
                        'public.polish'::regconfig,
                        coalesce(j.title, '') || ' ' ||
                        coalesce(j.summary, '') || ' ' ||
                        coalesce(j.full_text, '')
                    ) @@ ts_query_pl
                )
            )
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

    -- Trigram fuzzy fallback (KNN): only when text branch is empty
    -- Uses GiST trigram indexes via <-> to avoid broad similarity scans.
    fuzzy_title_candidates AS (
        SELECT
            j.id,
            similarity(j.title, search_text) AS sim
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM text_results LIMIT 1)
            -- Guardrails to keep typo fallback cheap and avoid pathological inputs
            AND char_length(search_text) BETWEEN 2 AND 40
            AND search_text ~ '[[:space:]]'
            AND search_text ~ '^[[:alnum:][:space:]ąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+$'
            AND j.title IS NOT NULL
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
        ORDER BY j.title <-> search_text
        LIMIT fetch_limit
    ),

    fuzzy_summary_candidates AS (
        SELECT
            j.id,
            similarity(j.summary, search_text) AS sim
        FROM public.judgments j
        WHERE search_text IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM text_results LIMIT 1)
            -- Same guardrails as title candidates
            AND char_length(search_text) BETWEEN 2 AND 40
            AND search_text ~ '[[:space:]]'
            AND search_text ~ '^[[:alnum:][:space:]ąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+$'
            AND j.summary IS NOT NULL
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
        ORDER BY j.summary <-> search_text
        LIMIT fetch_limit
    ),

    fuzzy_results AS (
        SELECT
            fc.id,
            fc.sim,
            ROW_NUMBER() OVER (ORDER BY fc.sim DESC, fc.id) AS frank
        FROM (
            SELECT
                c.id,
                MAX(c.sim) AS sim
            FROM (
                SELECT ftc.id, ftc.sim FROM fuzzy_title_candidates ftc
                UNION ALL
                SELECT fsc.id, fsc.sim FROM fuzzy_summary_candidates fsc
            ) c
            GROUP BY c.id
        ) fc
        WHERE fc.sim > 0.03
        ORDER BY fc.sim DESC, fc.id
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
    'Hybrid search with compact FTS fast path for short broad queries, '
    'summary-weighted ranking, trigram KNN typo fallback, and RRF fusion.';

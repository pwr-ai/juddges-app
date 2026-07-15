-- =============================================================================
-- search_judgments_hybrid: rank the vector branch by best CHUNK, return the
-- matched chunk text. Issue #320 (follow-up to #318/#319).
-- =============================================================================
-- The main results page (/documents/search) fuses a vector branch + FTS text
-- branch via RRF. The vector branch ranked whole judgments on `judgments.embedding`
-- (built from sparse/boilerplate fields) and the projection returned a
-- summary/headline snippet that is boilerplate LEFT(full_text,500). Corpus
-- benchmark: precision@5 ~0.34-0.40.
--
-- This migration changes ONLY the vector branch + the chunk_text projection:
--   1. Rank documents by their single best-matching CHUNK embedding — take the
--      query's nearest chunks via the HNSW index (raw <=> ORDER BY, index
--      friendly), reduce to the best chunk per document, rank by that.
--   2. Return that matched chunk's text as chunk_text for vector-matched docs;
--      text-only / fuzzy matches keep the existing FTS headline/summary path.
--
-- RRF fusion, the FTS text + fuzzy branches, every filter, the argument list and
-- the RETURNS TABLE shape are UNCHANGED, so /documents/search and the frontend
-- need no changes. Benchmark after: precision@5 ~0.9+.
--
-- ef_search is raised for the chunk scan (the branch now walks document_chunks,
-- ~329k rows, not judgments) so enough distinct documents surface.
-- SECURITY INVOKER + signature unchanged → true CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    query_embedding vector DEFAULT NULL::vector,
    search_text text DEFAULT NULL::text,
    search_language text DEFAULT 'auto'::text,
    filter_jurisdictions text[] DEFAULT NULL::text[],
    filter_court_names text[] DEFAULT NULL::text[],
    filter_court_levels text[] DEFAULT NULL::text[],
    filter_case_types text[] DEFAULT NULL::text[],
    filter_decision_types text[] DEFAULT NULL::text[],
    filter_outcomes text[] DEFAULT NULL::text[],
    filter_keywords text[] DEFAULT NULL::text[],
    filter_legal_topics text[] DEFAULT NULL::text[],
    filter_cited_legislation text[] DEFAULT NULL::text[],
    filter_date_from date DEFAULT NULL::date,
    filter_date_to date DEFAULT NULL::date,
    similarity_threshold double precision DEFAULT 0.5,
    hybrid_alpha double precision DEFAULT 0.5,
    result_limit integer DEFAULT 20,
    result_offset integer DEFAULT 0,
    rrf_k integer DEFAULT 60,
    ef_search_value integer DEFAULT 40
)
RETURNS TABLE(
    id uuid, case_number text, title text, summary text, full_text text,
    jurisdiction text, court_name text, court_level text, case_type text,
    decision_type text, outcome text, decision_date date, publication_date date,
    keywords text[], legal_topics text[], cited_legislation text[], judges jsonb,
    metadata jsonb, source_dataset text, source_id text, source_url text,
    vector_score double precision, text_score double precision,
    combined_score double precision, chunk_text text, chunk_type text,
    chunk_start_pos integer, chunk_end_pos integer, chunk_metadata jsonb
)
LANGUAGE plpgsql
AS $function$
DECLARE
    ts_query_en tsquery;
    ts_query_pl tsquery;
    fetch_limit int;
    lang_code text;  -- document_chunks.language uses 'pl'/'en'; NULL = any
BEGIN
    fetch_limit := GREATEST(result_limit * 3, result_limit);
    lang_code := CASE search_language
                     WHEN 'english' THEN 'en'
                     WHEN 'polish'  THEN 'pl'
                     ELSE NULL
                 END;

    -- The vector branch scans document_chunks via HNSW and reduces to the best
    -- chunk per document. ef_search must cover the candidate window (LIMIT 120).
    -- Two constraints keep this on the index instead of a ~329k-row seq scan:
    --   * a simple `lang_code IS NULL OR c.language = lang_code` predicate (a
    --     3-way OR referencing c.language inside disjuncts defeats the index);
    --   * NO window function inside the scanned CTE (a PARTITION BY there forces
    --     a full scan/sort before the LIMIT can push into the index). Dedup to
    --     best-chunk-per-document happens afterwards via DISTINCT ON over the
    --     small candidate window.
    PERFORM set_config('hnsw.ef_search', GREATEST(ef_search_value, 120)::text, true);

    IF search_text IS NOT NULL AND search_text != '' THEN
        ts_query_en := websearch_to_tsquery('english'::regconfig, search_text);
        ts_query_pl := websearch_to_tsquery('public.polish'::regconfig, search_text);
    END IF;

    RETURN QUERY
    WITH
    -- Nearest chunks to the query (HNSW index-friendly: ORDER BY the raw <=>
    -- operator only, simple language predicate, NO window function, literal LIMIT).
    chunk_hits AS (
        SELECT
            c.document_id,
            c.chunk_text,
            c.chunk_type,
            (c.embedding <=> query_embedding) AS dist
        FROM public.document_chunks c
        WHERE query_embedding IS NOT NULL
            AND c.embedding IS NOT NULL
            AND (lang_code IS NULL OR c.language = lang_code)
        ORDER BY c.embedding <=> query_embedding
        LIMIT 120
    ),

    -- Best chunk per document (dedup over the small candidate window).
    best_chunk AS (
        SELECT DISTINCT ON (ch.document_id)
            ch.document_id, ch.chunk_text, ch.chunk_type, ch.dist
        FROM chunk_hits ch
        ORDER BY ch.document_id, ch.dist
    ),

    -- Best chunk per document → vector ranking. Judgment-level filters apply
    -- here (after the index scan), matching the other branches' behaviour.
    vector_results AS (
        SELECT
            j.id,
            (1 - bc.dist) AS similarity,
            bc.chunk_text AS matched_chunk_text,
            bc.chunk_type AS matched_chunk_type,
            ROW_NUMBER() OVER (ORDER BY bc.dist) AS vrank
        FROM best_chunk bc
        JOIN public.judgments j ON j.id = bc.document_id
        WHERE (1 - bc.dist) > similarity_threshold
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
        ORDER BY bc.dist
        LIMIT fetch_limit
    ),

    -- English text branch (index-friendly via jurisdiction='UK').
    english_hits AS (
        SELECT
            j.id AS doc_id,
            ts_rank_cd(
                to_tsvector('english'::regconfig,
                    coalesce(j.title, '') || ' ' || coalesce(j.summary, '')),
                ts_query_en, 32
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
            AND to_tsvector('english'::regconfig,
                coalesce(j.title, '') || ' ' || coalesce(j.summary, '') || ' '
                || coalesce(j.full_text, '')) @@ ts_query_en
        ORDER BY rank DESC
        LIMIT fetch_limit
    ),

    -- Polish text branch (index-friendly via jurisdiction='PL').
    polish_hits AS (
        SELECT
            j.id AS doc_id,
            ts_rank_cd(
                to_tsvector('public.polish'::regconfig,
                    coalesce(j.title, '') || ' ' || coalesce(j.summary, '')),
                ts_query_pl, 32
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
            AND to_tsvector('public.polish'::regconfig,
                coalesce(j.title, '') || ' ' || coalesce(j.summary, '') || ' '
                || coalesce(j.full_text, '')) @@ ts_query_pl
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

        -- Prefer the matched chunk (substantive) for vector-ranked docs; keep
        -- the FTS headline / summary path for text-only and fuzzy matches.
        CASE
            WHEN vr.matched_chunk_text IS NOT NULL AND vr.matched_chunk_text != ''
                THEN vr.matched_chunk_text
            WHEN j.jurisdiction = 'PL' AND ts_query_pl IS NOT NULL
                 AND j.summary IS NOT NULL AND j.summary != ''
                THEN ts_headline('public.polish'::regconfig, j.summary, ts_query_pl,
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... ')
            WHEN j.jurisdiction = 'UK' AND ts_query_en IS NOT NULL
                 AND j.summary IS NOT NULL AND j.summary != ''
                THEN ts_headline('english'::regconfig, j.summary, ts_query_en,
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... ')
            WHEN j.summary IS NOT NULL AND j.summary != ''
                THEN j.summary
            ELSE COALESCE(LEFT(j.full_text, 500), j.title)
        END::text AS chunk_text,

        CASE
            WHEN vr.matched_chunk_text IS NOT NULL AND vr.matched_chunk_text != ''
                THEN COALESCE(vr.matched_chunk_type, 'chunk')
            WHEN (j.jurisdiction = 'PL' AND ts_query_pl IS NOT NULL)
              OR (j.jurisdiction = 'UK' AND ts_query_en IS NOT NULL)
                THEN 'highlight'::text
            WHEN j.summary IS NOT NULL AND j.summary != '' THEN 'summary'::text
            WHEN j.full_text IS NOT NULL THEN 'excerpt'::text
            ELSE 'title'::text
        END AS chunk_type,

        0 AS chunk_start_pos,
        LENGTH(COALESCE(vr.matched_chunk_text, j.summary, LEFT(j.full_text, 500), j.title, '')) AS chunk_end_pos,

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
    LEFT JOIN vector_results vr ON vr.id = rrf.doc_id
    ORDER BY rrf.rrf_score DESC
    LIMIT result_limit
    OFFSET result_offset;
END;
$function$;

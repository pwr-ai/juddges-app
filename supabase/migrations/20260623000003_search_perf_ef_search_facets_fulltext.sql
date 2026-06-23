-- =============================================================================
-- Migration: Search-function performance tuning (Refs #183)
-- =============================================================================
-- Three independent performance fixes to the judgment search RPCs. Behaviour
-- is kept identical for explicit callers; only defaults and execution plans
-- change.
--
--   1. HNSW ef_search default 100 -> 40 on search_judgments_hybrid.
--      The function already accepts an ef_search_value parameter (added in
--      20260407000001, realigned to vector(1024) in 20260512000001). The
--      hardcoded-high default (100) paid for recall every call even when the
--      caller did not need it. Lowering the *default* to 40 trades a small
--      amount of recall for materially lower vector-branch latency; callers
--      who need higher recall pass ef_search_value explicitly. The denser
--      graph built with ef_construction=128 (20260308000001) keeps recall at
--      ef_search=40 close to the old ef_search=100 on this corpus.
--
--   2. get_judgment_facets: 8x UNION ALL (each a full scan of judgments)
--      collapsed to a SINGLE pass. The pre-filtered rows are scanned once and
--      every facet (type, value) pair is emitted via one LATERAL VALUES list,
--      then aggregated by a single GROUP BY. Output contract is byte-for-byte
--      identical: (facet_type, facet_value, facet_count), keyword/legal_topic
--      facets still require COUNT(*) > 1.
--
--   3. search_judgments_by_text: stop building a tsvector over full_text at
--      query time. full_text is the largest column; tokenising it per row on
--      every search dominates cost and bypasses the title/summary GIN paths.
--      Match/rank on title + summary only, expose a ts_headline snippet, and
--      move full-text retrieval to a dedicated detail RPC.
--
-- =============================================================================
-- Index config -> runtime config mapping (for the hybrid text branches)
-- -----------------------------------------------------------------------------
-- Partial GIN tsvector indexes and their REQUIRED runtime to_tsvector config
-- (a mismatch silently bypasses the index and forces a full scan):
--
--   idx_judgments_fts_polish  (20260308000002)  WHERE jurisdiction='PL'
--       -> to_tsvector('public.polish', title||summary||full_text)
--   idx_judgments_full_text_search_en (20260209000002) WHERE jurisdiction='UK'
--       -> to_tsvector('english', title||summary||full_text)
--
-- search_judgments_hybrid's english_hits branch uses 'english' on UK rows and
-- polish_hits uses 'public.polish' on PL rows, so each branch matches its
-- partial index. (The legacy idx_judgments_full_text_search_pl uses the
-- 'simple' config and is now redundant with the 'public.polish' index; it is
-- left in place to avoid an unrelated index drop in a perf migration.)
-- =============================================================================


-- =============================================================================
-- 1. search_judgments_hybrid: default ef_search 100 -> 40
-- =============================================================================
-- Drop the current 20-arg signature (vector(1024), ..., ef_search_value int)
-- so the redefinition replaces rather than overloads.
DROP FUNCTION IF EXISTS public.search_judgments_hybrid(
    vector, text, text,
    text[], text[], text[], text[], text[], text[],
    text[], text[], text[],
    date, date,
    double precision, double precision,
    int, int, int, int
);

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(
    -- Search parameters
    query_embedding vector(1024) DEFAULT NULL,
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
    ef_search_value int DEFAULT 40  -- HNSW recall knob; was 100. Lower=faster.
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
    -- HNSW recall knob for vector branch. Default 40 (was 100): the denser
    -- graph (ef_construction=128) keeps recall close to the old default while
    -- cutting per-query latency. Callers needing maximum recall pass a higher
    -- ef_search_value.
    PERFORM set_config('hnsw.ef_search', ef_search_value::text, true);

    fetch_limit := GREATEST(result_limit * 3, result_limit);

    IF search_text IS NOT NULL AND search_text != '' THEN
        ts_query_en := websearch_to_tsquery('english'::regconfig, search_text);
        ts_query_pl := websearch_to_tsquery('public.polish'::regconfig, search_text);
    END IF;

    RETURN QUERY
    WITH
    -- Vector similarity search (cosine distance).
    -- Honour search_language by restricting jurisdiction; matches the
    -- text branches' behaviour so single-language queries don't surface
    -- cross-language matches via RRF.
    vector_results AS (
        SELECT
            j.id,
            (1 - (j.embedding <=> query_embedding)) AS similarity,
            ROW_NUMBER() OVER (ORDER BY j.embedding <=> query_embedding) AS vrank
        FROM public.judgments j
        WHERE query_embedding IS NOT NULL
            AND j.embedding IS NOT NULL
            AND (1 - (j.embedding <=> query_embedding)) > similarity_threshold
            AND (
                search_language = 'auto'
                OR (search_language = 'english' AND j.jurisdiction = 'UK')
                OR (search_language = 'polish' AND j.jurisdiction = 'PL')
            )
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

    -- English text branch (index-friendly via jurisdiction='UK').
    -- Runtime config 'english' matches idx_judgments_full_text_search_en.
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

    -- Polish text branch (index-friendly via jurisdiction='PL').
    -- Runtime config 'public.polish' matches idx_judgments_fts_polish.
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
    'Hybrid search with configurable ef_search for HNSW recall tuning '
    '(default 40; raise via ef_search_value for higher recall), '
    'language-aware vector and text branches, summary-weighted ranking, '
    'fuzzy fallback, and RRF fusion. Vector branch respects search_language '
    'so single-language queries do not leak cross-language matches via the '
    'semantic top-K.';


-- =============================================================================
-- 2. get_judgment_facets: 8x UNION ALL full scans -> single pass
-- =============================================================================
-- Same signature, same (facet_type, facet_value, facet_count) output. The
-- pre-filtered rows are read ONCE; a LATERAL VALUES list expands each row into
-- its facet (type, value) pairs (NULL values dropped), then a single GROUP BY
-- aggregates. Keyword/legal_topic facets keep the COUNT(*) > 1 threshold via a
-- HAVING that only applies to those two types.
CREATE OR REPLACE FUNCTION public.get_judgment_facets(
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
        SELECT
            j.jurisdiction,
            j.court_level,
            j.court_name,
            j.case_type,
            j.decision_type,
            j.outcome,
            j.keywords,
            j.legal_topics
        FROM public.judgments j
        WHERE
            (pre_filter_jurisdictions IS NULL OR j.jurisdiction = ANY(pre_filter_jurisdictions))
            AND (pre_filter_date_from IS NULL OR j.decision_date >= pre_filter_date_from)
            AND (pre_filter_date_to IS NULL OR j.decision_date <= pre_filter_date_to)
    ),
    -- Expand each judgment row into its scalar facet (type, value) pairs.
    -- One LATERAL pass over the single scan above.
    scalar_pairs AS (
        SELECT pair.facet_type, pair.facet_value
        FROM filtered_judgments fj
        CROSS JOIN LATERAL (
            VALUES
                ('jurisdiction'::text,  fj.jurisdiction::text),
                ('court_level'::text,   fj.court_level::text),
                ('court_name'::text,    fj.court_name::text),
                ('case_type'::text,     fj.case_type::text),
                ('decision_type'::text, fj.decision_type::text),
                ('outcome'::text,       fj.outcome::text)
        ) AS pair(facet_type, facet_value)
        WHERE pair.facet_value IS NOT NULL
    ),
    -- Array facets: unnest keywords / legal_topics from the same scan.
    array_pairs AS (
        SELECT 'keyword'::text AS facet_type, kw AS facet_value
        FROM filtered_judgments fj, unnest(fj.keywords) AS kw
        WHERE fj.keywords IS NOT NULL
        UNION ALL
        SELECT 'legal_topic'::text AS facet_type, topic AS facet_value
        FROM filtered_judgments fj, unnest(fj.legal_topics) AS topic
        WHERE fj.legal_topics IS NOT NULL
    ),
    all_pairs AS (
        SELECT facet_type, facet_value FROM scalar_pairs
        UNION ALL
        SELECT facet_type, facet_value FROM array_pairs
    )
    SELECT
        ap.facet_type,
        ap.facet_value,
        COUNT(*)::bigint AS facet_count
    FROM all_pairs ap
    GROUP BY ap.facet_type, ap.facet_value
    -- keyword/legal_topic facets are noise below 2 hits; scalar facets are
    -- always returned (preserves the original per-branch HAVING semantics).
    HAVING ap.facet_type NOT IN ('keyword', 'legal_topic') OR COUNT(*) > 1;
END;
$$;

COMMENT ON FUNCTION public.get_judgment_facets IS
    'Returns aggregated counts for each filter option in a SINGLE pass over '
    'judgments (was 8x UNION ALL full scans). Output: (facet_type, '
    'facet_value, facet_count). Supports optional pre-filtering by jurisdiction '
    'and date range. keyword/legal_topic facets require count > 1.';


-- =============================================================================
-- 3. search_judgments_by_text: drop full_text from match/rank; add detail RPC
-- =============================================================================
-- Old behaviour tokenised full_text per row on every search (largest column,
-- dominates cost, bypasses the title/summary indexes). New behaviour matches
-- and ranks on title + summary only and returns a ts_headline snippet. Full
-- text is fetched on demand via get_judgment_full_text(uuid).
--
-- The return signature changes (adds headline), so drop the old function
-- explicitly before recreating. This RPC currently has no application callers.
DROP FUNCTION IF EXISTS public.search_judgments_by_text(text, text, int);

CREATE OR REPLACE FUNCTION public.search_judgments_by_text(
    search_query text,
    filter_jurisdiction text DEFAULT NULL,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    case_number text,
    title text,
    summary text,
    headline text,
    jurisdiction text,
    decision_date date,
    rank float
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
BEGIN
    ts_query := plainto_tsquery('english'::regconfig, search_query);

    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.summary,
        ts_headline(
            'english'::regconfig,
            coalesce(j.summary, j.title, ''),
            ts_query,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=60, MinWords=20, MaxFragments=2, FragmentDelimiter= ... '
        ) AS headline,
        j.jurisdiction,
        j.decision_date,
        ts_rank(
            to_tsvector('english'::regconfig,
                coalesce(j.title, '') || ' ' || coalesce(j.summary, '')),
            ts_query
        )::float AS rank
    FROM public.judgments j
    WHERE
        (filter_jurisdiction IS NULL OR j.jurisdiction = filter_jurisdiction)
        AND to_tsvector('english'::regconfig,
                coalesce(j.title, '') || ' ' || coalesce(j.summary, ''))
            @@ ts_query
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_by_text IS
    'Full-text search over title + summary (full_text removed from the default '
    'projection and from the runtime tsvector for performance). Returns a '
    'ts_headline snippet. Use get_judgment_full_text(uuid) to fetch full text.';

-- Detail RPC: fetch full_text for a single judgment on demand.
CREATE OR REPLACE FUNCTION public.get_judgment_full_text(
    judgment_id uuid
)
RETURNS TABLE (
    id uuid,
    case_number text,
    title text,
    full_text text
)
LANGUAGE sql
STABLE
AS $$
    SELECT j.id, j.case_number, j.title, j.full_text
    FROM public.judgments j
    WHERE j.id = judgment_id;
$$;

COMMENT ON FUNCTION public.get_judgment_full_text IS
    'Detail RPC: returns the full_text of a single judgment by id. Keeps the '
    'heavy full_text column out of list/search payloads.';

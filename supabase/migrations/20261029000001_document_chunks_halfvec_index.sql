-- =============================================================================
-- document_chunks: HNSW over halfvec(1024) instead of vector(1024)
-- =============================================================================
-- The full-precision HNSW index on document_chunks.embedding is 2.5 GB for
-- ~329k chunks (~7.8 KB per vector) and no longer fits in the instance's RAM,
-- which shows up as 57014 statement timeouts on /documents/search.
--
-- An expression index on embedding::halfvec(1024) stores 2-byte floats in the
-- graph. Benchmarked on 400k real bge-m3 chunk vectors (pgvector 0.8.1, m=16,
-- ef_construction=64): index 2.7 KB/vector vs 8.2 KB, recall@10 0.981 vs 0.984
-- at ef_search=100, same latency. The column itself stays vector(1024), so the
-- ingestion and chunking code is unchanged; only the ORDER BY in the two chunk
-- RPCs casts both sides to halfvec(1024) so the planner picks the new index.
--
-- Production rollout: CREATE INDEX here is not CONCURRENTLY because migrations
-- run inside a transaction. On a populated database build the index first,
-- outside a transaction, then apply this file (IF NOT EXISTS makes it a no-op):
--
--   SET maintenance_work_mem = '256MB'; SET statement_timeout = 0;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding_halfvec
--       ON public.document_chunks
--       USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
--       WITH (m = 16, ef_construction = 64);
--
-- Function bodies are otherwise identical to 20260715000002 and 20260719000001.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_halfvec
    ON public.document_chunks
    USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION public.search_chunks_by_embedding(query_embedding vector, match_threshold double precision DEFAULT 0.2, match_count integer DEFAULT 20, filter_language text DEFAULT NULL::text, filter_jurisdiction text DEFAULT NULL::text, boost_key_sections boolean DEFAULT true)
 RETURNS TABLE(chunk_id uuid, document_id uuid, chunk_index integer, chunk_text text, chunk_type text, section_title text, is_key_section boolean, token_count integer, language text, similarity double precision, case_number text, jurisdiction text, court_name text, decision_date date, title text)
 LANGUAGE plpgsql
AS $function$
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
            c.language, (c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)) AS dist
        FROM public.document_chunks c
        WHERE c.embedding IS NOT NULL
          AND (filter_language IS NULL OR c.language = filter_language)
          AND (filter_jurisdiction IS NULL OR EXISTS (
                SELECT 1 FROM public.judgments j
                WHERE j.id = c.document_id AND j.jurisdiction = filter_jurisdiction))
        ORDER BY c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)
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
                c.language, (c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)) AS dist
            FROM public.document_chunks c
            WHERE c.embedding IS NOT NULL
              AND (filter_jurisdiction IS NULL OR EXISTS (
                    SELECT 1 FROM public.judgments j
                    WHERE j.id = c.document_id AND j.jurisdiction = filter_jurisdiction))
            ORDER BY c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)
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
$function$

;

CREATE OR REPLACE FUNCTION public.search_judgments_hybrid(query_embedding vector DEFAULT NULL::vector, search_text text DEFAULT NULL::text, search_language text DEFAULT 'auto'::text, filter_jurisdictions text[] DEFAULT NULL::text[], filter_court_names text[] DEFAULT NULL::text[], filter_court_levels text[] DEFAULT NULL::text[], filter_case_types text[] DEFAULT NULL::text[], filter_decision_types text[] DEFAULT NULL::text[], filter_outcomes text[] DEFAULT NULL::text[], filter_keywords text[] DEFAULT NULL::text[], filter_legal_topics text[] DEFAULT NULL::text[], filter_cited_legislation text[] DEFAULT NULL::text[], filter_date_from date DEFAULT NULL::date, filter_date_to date DEFAULT NULL::date, similarity_threshold double precision DEFAULT 0.5, hybrid_alpha double precision DEFAULT 0.5, result_limit integer DEFAULT 20, result_offset integer DEFAULT 0, rrf_k integer DEFAULT 60, ef_search_value integer DEFAULT 40)
 RETURNS TABLE(id uuid, case_number text, title text, summary text, full_text text, jurisdiction text, court_name text, court_level text, case_type text, decision_type text, outcome text, decision_date date, publication_date date, keywords text[], legal_topics text[], cited_legislation text[], judges jsonb, metadata jsonb, source_dataset text, source_id text, source_url text, vector_score double precision, text_score double precision, combined_score double precision, chunk_text text, chunk_type text, chunk_start_pos integer, chunk_end_pos integer, chunk_metadata jsonb)
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
            c.is_key_section,
            c.relevance_weight,
            (c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)) AS dist
        FROM public.document_chunks c
        WHERE query_embedding IS NOT NULL
            AND c.embedding IS NOT NULL
            AND (lang_code IS NULL OR c.language = lang_code)
        ORDER BY c.embedding::halfvec(1024) <=> query_embedding::halfvec(1024)
        LIMIT 120
    ),

    -- Best chunk per document (dedup over the small candidate window).
    best_chunk AS (
        -- Key-section boost: (1 - dist) * relevance_weight for key sections
        -- (recovers the standalone chunk RPC's precision). Pick the
        -- highest-boosted chunk per document.
        SELECT DISTINCT ON (ch.document_id)
            ch.document_id, ch.chunk_text, ch.chunk_type, ch.dist,
            (1 - ch.dist) * (CASE WHEN ch.is_key_section
                                  THEN COALESCE(ch.relevance_weight, 1) ELSE 1 END) AS bscore
        FROM chunk_hits ch
        ORDER BY ch.document_id,
                 (1 - ch.dist) * (CASE WHEN ch.is_key_section
                                       THEN COALESCE(ch.relevance_weight, 1) ELSE 1 END) DESC
    ),

    -- Best chunk per document → vector ranking. Judgment-level filters apply
    -- here (after the index scan), matching the other branches' behaviour.
    vector_results AS (
        SELECT
            j.id,
            -- vector_score stays the raw cosine similarity in [0,1]; the boost
            -- affects RANKING only (vrank / chunk selection), not the reported
            -- score, and the threshold keeps its raw-similarity meaning.
            (1 - bc.dist) AS similarity,
            bc.chunk_text AS matched_chunk_text,
            bc.chunk_type AS matched_chunk_type,
            ROW_NUMBER() OVER (ORDER BY bc.bscore DESC) AS vrank
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
        ORDER BY bc.bscore DESC
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
                   0.5 / (rrf_k + t.trank) AS rrf_contribution,  -- de-noise: title/summary are boilerplate
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

    -- Outer projection: recompute chunk_end_pos from the ACTUAL returned
    -- chunk_text (ts_headline may shorten the matched chunk), so
    -- [chunk_start_pos, chunk_end_pos) spans the snippet the caller receives.
    SELECT
        a.id, a.case_number, a.title, a.summary, a.full_text, a.jurisdiction,
        a.court_name, a.court_level, a.case_type, a.decision_type, a.outcome,
        a.decision_date, a.publication_date, a.keywords, a.legal_topics,
        a.cited_legislation, a.judges, a.metadata, a.source_dataset,
        a.source_id, a.source_url, a.vector_score, a.text_score,
        a.combined_score, a.chunk_text, a.chunk_type, a.chunk_start_pos,
        char_length(a.chunk_text) AS chunk_end_pos,
        a.chunk_metadata
    FROM (
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
                THEN CASE
                    WHEN j.jurisdiction = 'PL' AND ts_query_pl IS NOT NULL
                        THEN ts_headline('public.polish'::regconfig, vr.matched_chunk_text, ts_query_pl,
                            'StartSel=<mark>, StopSel=</mark>, MaxWords=80, MinWords=30, MaxFragments=2, FragmentDelimiter= ... ')
                    WHEN j.jurisdiction = 'UK' AND ts_query_en IS NOT NULL
                        THEN ts_headline('english'::regconfig, vr.matched_chunk_text, ts_query_en,
                            'StartSel=<mark>, StopSel=</mark>, MaxWords=80, MinWords=30, MaxFragments=2, FragmentDelimiter= ... ')
                    ELSE vr.matched_chunk_text
                END
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
        0 AS chunk_end_pos,  -- recomputed from chunk_text in the outer projection

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
        OFFSET result_offset
    ) a
    ORDER BY a.combined_score DESC;
END;
$function$

;

DROP INDEX IF EXISTS public.idx_document_chunks_embedding;

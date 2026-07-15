-- =============================================================================
-- Migration: DB perf hardening (issue #184)
-- =============================================================================
-- 1. refresh_dashboard_stats(): replace blocking TRUNCATE+INSERT with idempotent
--    upserts so readers of dashboard_precomputed_stats / doc_type_stats are not
--    blocked during a refresh.
-- 2. Add missing supporting index on agent_checkpoints.parent_id (self-ref FK).
-- 3. Add single-column index on research_sessions.status for status-faceted
--    queries (existing composite leads with user_id and can't serve them).
-- 4. (No-op) The free-text branch was already indexed by migration
--    20260505000001 (STORED base_search_tsv column + GIN); documented below.
-- 5. Document collection_judgments.judgment_id as an intentional soft link
--    (TEXT, no FK to the UUID judgments.id).
-- =============================================================================


-- =============================================================================
-- 1. refresh_dashboard_stats() — upsert instead of TRUNCATE
-- =============================================================================
-- The set of stat_key / doc_type rows is fixed, so ON CONFLICT DO UPDATE keeps
-- exactly the same rows the old TRUNCATE+INSERT produced, but without taking an
-- ACCESS EXCLUSIVE lock that stalls concurrent SELECTs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- preserve lockdown hardening (20260623000001)
AS $$
DECLARE
    v_total          BIGINT;
    v_total_pl       BIGINT;
    v_total_uk       BIGINT;
    v_now            TIMESTAMPTZ := NOW();
BEGIN

    -- -------------------------------------------------------------------------
    -- Pre-aggregate frequently reused scalars to avoid repeated full scans
    -- -------------------------------------------------------------------------
    SELECT
        COUNT(*)                                            INTO v_total
    FROM public.judgments;

    SELECT COUNT(*) INTO v_total_pl
    FROM public.judgments
    WHERE jurisdiction = 'PL';

    SELECT COUNT(*) INTO v_total_uk
    FROM public.judgments
    WHERE jurisdiction = 'UK';

    -- =========================================================================
    -- dashboard_precomputed_stats
    -- =========================================================================

    -- -------------------------------------------------------------------------
    -- Category: counts
    -- -------------------------------------------------------------------------

    -- total_judgments
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    VALUES (
        'total_judgments',
        to_jsonb(v_total),
        'counts',
        v_now
    )
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- judgments_by_jurisdiction
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    VALUES (
        'judgments_by_jurisdiction',
        jsonb_build_object('PL', v_total_pl, 'UK', v_total_uk),
        'counts',
        v_now
    )
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- -------------------------------------------------------------------------
    -- Category: distribution
    -- -------------------------------------------------------------------------

    -- court_level_distribution
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'court_level_distribution',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'level',       COALESCE(court_level, 'Unknown'),
                    'count',       cnt,
                    'jurisdiction', jurisdiction
                )
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            jurisdiction,
            COALESCE(court_level, 'Unknown') AS court_level,
            COUNT(*)                          AS cnt
        FROM public.judgments
        GROUP BY jurisdiction, court_level
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- top_courts (top 15)
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'top_courts',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name',        court_name,
                    'count',       cnt,
                    'jurisdiction', jurisdiction
                )
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            jurisdiction,
            COALESCE(court_name, 'Unknown') AS court_name,
            COUNT(*)                         AS cnt
        FROM public.judgments
        WHERE court_name IS NOT NULL
        GROUP BY jurisdiction, court_name
        ORDER BY cnt DESC
        LIMIT 15
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- decisions_per_year
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'decisions_per_year',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('year', yr, 'count', cnt)
                ORDER BY yr
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            EXTRACT(YEAR FROM decision_date)::INT AS yr,
            COUNT(*)                               AS cnt
        FROM public.judgments
        WHERE decision_date IS NOT NULL
        GROUP BY yr
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- date_range
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'date_range',
        jsonb_build_object(
            'oldest', to_char(MIN(decision_date), 'YYYY-MM-DD'),
            'newest', to_char(MAX(decision_date), 'YYYY-MM-DD')
        ),
        'distribution',
        v_now
    FROM public.judgments
    WHERE decision_date IS NOT NULL
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- case_type_distribution
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'case_type_distribution',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('type', ct, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            COALESCE(case_type, 'Unknown') AS ct,
            COUNT(*)                        AS cnt
        FROM public.judgments
        GROUP BY case_type
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- decision_type_distribution
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'decision_type_distribution',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('type', dt, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            COALESCE(decision_type, 'Unknown') AS dt,
            COUNT(*)                            AS cnt
        FROM public.judgments
        GROUP BY decision_type
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- outcome_distribution
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'outcome_distribution',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('outcome', oc, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            COALESCE(outcome, 'Unknown') AS oc,
            COUNT(*)                      AS cnt
        FROM public.judgments
        GROUP BY outcome
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- -------------------------------------------------------------------------
    -- Category: completeness
    -- -------------------------------------------------------------------------

    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'data_completeness',
        jsonb_build_object(
            'embeddings_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE embedding IS NOT NULL))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'structure_extraction_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE structure_extraction_status = 'completed'))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'deep_analysis_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE deep_analysis_status = 'completed'))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'with_summary_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary <> ''))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'with_keywords_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE keywords IS NOT NULL AND array_length(keywords, 1) > 0))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'with_legal_topics_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE legal_topics IS NOT NULL AND array_length(legal_topics, 1) > 0))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'with_cited_legislation_pct',
            CASE WHEN v_total > 0
                 THEN ROUND(
                     (COUNT(*) FILTER (WHERE cited_legislation IS NOT NULL AND array_length(cited_legislation, 1) > 0))::NUMERIC
                     / v_total * 100, 1)
                 ELSE 0 END,

            'avg_text_length_chars',
            COALESCE(ROUND(AVG(COALESCE(LENGTH(full_text), 0))), 0)
        ),
        'completeness',
        v_now
    FROM public.judgments
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- -------------------------------------------------------------------------
    -- Category: legal_insights
    -- -------------------------------------------------------------------------

    -- top_legal_domains (top 20, unnested from deep_legal_domains[])
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'top_legal_domains',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('name', domain, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'legal_insights',
        v_now
    FROM (
        SELECT
            TRIM(domain) AS domain,
            COUNT(*)      AS cnt
        FROM public.judgments,
             UNNEST(COALESCE(deep_legal_domains, ARRAY[]::TEXT[])) AS domain
        WHERE TRIM(domain) <> ''
        GROUP BY TRIM(domain)
        ORDER BY cnt DESC
        LIMIT 20
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- top_keywords (top 30, unnested from keywords[])
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'top_keywords',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('name', kw, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'legal_insights',
        v_now
    FROM (
        SELECT
            TRIM(kw) AS kw,
            COUNT(*) AS cnt
        FROM public.judgments,
             UNNEST(COALESCE(keywords, ARRAY[]::TEXT[])) AS kw
        WHERE TRIM(kw) <> ''
        GROUP BY TRIM(kw)
        ORDER BY cnt DESC
        LIMIT 30
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- top_cited_legislation (top 20, unnested from cited_legislation[])
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'top_cited_legislation',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('name', leg, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'legal_insights',
        v_now
    FROM (
        SELECT
            TRIM(leg) AS leg,
            COUNT(*)   AS cnt
        FROM public.judgments,
             UNNEST(COALESCE(cited_legislation, ARRAY[]::TEXT[])) AS leg
        WHERE TRIM(leg) <> ''
        GROUP BY TRIM(leg)
        ORDER BY cnt DESC
        LIMIT 20
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- -------------------------------------------------------------------------
    -- Category: complexity
    -- -------------------------------------------------------------------------

    -- complexity_metrics
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'complexity_metrics',
        jsonb_build_object(
            'avg_complexity',
            COALESCE(ROUND(AVG(deep_complexity_score::NUMERIC), 2), 0),

            'avg_reasoning_quality',
            COALESCE(ROUND(AVG(deep_reasoning_quality_score::NUMERIC), 2), 0),

            'precedential_value_distribution',
            jsonb_build_object(
                'high',   COUNT(*) FILTER (WHERE deep_precedential_value = 'high'),
                'medium', COUNT(*) FILTER (WHERE deep_precedential_value = 'medium'),
                'low',    COUNT(*) FILTER (WHERE deep_precedential_value = 'low'),
                'none',   COUNT(*) FILTER (WHERE deep_precedential_value = 'none')
            ),

            'research_value_distribution',
            jsonb_build_object(
                'high',   COUNT(*) FILTER (WHERE deep_research_value = 'high'),
                'medium', COUNT(*) FILTER (WHERE deep_research_value = 'medium'),
                'low',    COUNT(*) FILTER (WHERE deep_research_value = 'low')
            )
        ),
        'complexity',
        v_now
    FROM public.judgments
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- judicial_tone_distribution
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    SELECT
        'judicial_tone_distribution',
        COALESCE(
            jsonb_agg(
                jsonb_build_object('tone', tone, 'count', cnt)
                ORDER BY cnt DESC
            ),
            '[]'::jsonb
        ),
        'complexity',
        v_now
    FROM (
        SELECT
            COALESCE(deep_judicial_tone, 'Unknown') AS tone,
            COUNT(*)                                 AS cnt
        FROM public.judgments
        WHERE deep_judicial_tone IS NOT NULL
        GROUP BY deep_judicial_tone
    ) sub
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value  = EXCLUDED.stat_value,
        category    = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    -- =========================================================================
    -- doc_type_stats  (legacy table)
    -- =========================================================================
    INSERT INTO public.doc_type_stats (doc_type, count, created_at)
    VALUES
        -- Grand total
        ('TOTAL',                  v_total,    v_now),
        -- All judgments regardless of jurisdiction
        ('judgment',               v_total,    v_now),
        -- By jurisdiction
        ('judgment_pl',            v_total_pl, v_now),
        ('judgment_uk',            v_total_uk, v_now),
        -- Tax interpretations: not stored in judgments table; default to 0
        ('tax_interpretation',     0,          v_now),
        ('tax_interpretation_pl',  0,          v_now),
        ('tax_interpretation_uk',  0,          v_now)
    ON CONFLICT (doc_type) DO UPDATE SET
        count      = EXCLUDED.count,
        created_at = EXCLUDED.created_at;

END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_stats() IS
    'Rebuild both dashboard_precomputed_stats and doc_type_stats from the current '
    'state of public.judgments.  Safe to call repeatedly (idempotent via upsert on '
    'the stat_key / doc_type keys — no TRUNCATE, so concurrent readers never block).';

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO service_role;


-- =============================================================================
-- 2. Missing index: agent_checkpoints.parent_id (self-referential FK)
-- =============================================================================
-- The FK parent_id -> agent_checkpoints(id) had no supporting index, forcing a
-- seq scan for lineage traversal and for FK-cascade checks on delete.
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_parent_id
    ON public.agent_checkpoints (parent_id);


-- =============================================================================
-- 3. Missing index: research_sessions.status
-- =============================================================================
-- The existing composite idx_research_sessions_user_status leads with user_id,
-- so status-only faceted queries (e.g. "all running sessions") can't use it.
CREATE INDEX IF NOT EXISTS idx_research_sessions_status
    ON public.research_sessions (status);


-- =============================================================================
-- 4. Free-text filter index: ALREADY RESOLVED — no action here
-- =============================================================================
-- Issue #184 item 4 referenced the pre-2026-05-05 body of
-- filter_documents_by_extracted_data(), which computed to_tsvector() over 11
-- concatenated base_* fields per row. That was superseded by migration
-- 20260505000001 (Tier 2): a STORED generated column public.judgments.base_search_tsv
-- (built via the IMMUTABLE public._immutable_array_to_string wrapper), a GIN
-- index idx_judgments_base_search_tsv, and the RPC now matches
-- `j.base_search_tsv @@ websearch_to_tsquery('simple', p_text_query)`. No new
-- index is needed; adding one would duplicate idx_judgments_base_search_tsv.


-- =============================================================================
-- 5. collection_judgments.judgment_id — document intentional soft link
-- =============================================================================
-- judgments.id is UUID; collection_judgments.judgment_id is TEXT, so a real FK
-- is not type-compatible. The soft link is intentional: it lets a collection
-- reference judgments that may be re-ingested / re-keyed without cascade
-- coupling. Orphan rows are tolerated and filtered at read time. Lookups are
-- already served by idx_collection_judgments_judgment_id.
COMMENT ON COLUMN public.collection_judgments.judgment_id IS
    'Soft link to judgments.id (stored as TEXT — judgments.id is UUID, so no FK '
    'is enforced). Intentional: allows references to re-ingested/re-keyed '
    'judgments without cascade coupling. Orphans are tolerated and filtered at '
    'query time. Indexed by idx_collection_judgments_judgment_id.';

-- =============================================================================
-- Migration: Create precomputed dashboard statistics tables and refresh function
-- =============================================================================
-- Purpose: Provide fast, cache-friendly dashboard statistics for the Juddges
-- front-end and backend API without running expensive aggregations on every
-- request.  The data in the `judgments` table is largely static, so we
-- materialise all required metrics into two tables:
--
--   1. dashboard_precomputed_stats  – rich, categorised JSONB metrics used by
--      the new dashboard analytics endpoints.
--
--   2. doc_type_stats – legacy flat table expected by the existing
--      backend/app/dashboard.py code (judgments/tax_interpretations counts).
--
-- Call `SELECT refresh_dashboard_stats();` at any time to rebuild both tables
-- from the current contents of public.judgments.  The function is idempotent.
-- =============================================================================


-- =============================================================================
-- 1. dashboard_precomputed_stats
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dashboard_precomputed_stats (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_key    TEXT        NOT NULL,
    stat_value  JSONB       NOT NULL,
    category    TEXT        NOT NULL,
    computed_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT dashboard_precomputed_stats_stat_key_unique UNIQUE (stat_key)
);

COMMENT ON TABLE public.dashboard_precomputed_stats IS
    'Precomputed dashboard statistics derived from public.judgments. '
    'Rebuilt by refresh_dashboard_stats(). Categories: counts, distribution, '
    'completeness, legal_insights, complexity.';

COMMENT ON COLUMN public.dashboard_precomputed_stats.stat_key IS
    'Unique identifier for the stat row, e.g. ''total_judgments''.';
COMMENT ON COLUMN public.dashboard_precomputed_stats.stat_value IS
    'The computed metric value as JSONB (scalar or array/object).';
COMMENT ON COLUMN public.dashboard_precomputed_stats.category IS
    'Logical group: counts | distribution | completeness | legal_insights | complexity.';

CREATE INDEX IF NOT EXISTS idx_dps_category
    ON public.dashboard_precomputed_stats (category);

-- RLS: only the service_role can read or write (backend uses service_role key)
ALTER TABLE public.dashboard_precomputed_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on dashboard_precomputed_stats"
    ON public.dashboard_precomputed_stats;

CREATE POLICY "Service role full access on dashboard_precomputed_stats"
    ON public.dashboard_precomputed_stats
    FOR ALL
    USING  (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.dashboard_precomputed_stats TO service_role;


-- =============================================================================
-- 2. doc_type_stats  (legacy table consumed by backend/app/dashboard.py)
-- =============================================================================
-- The backend maps these doc_type keys to DashboardStats fields:
--   TOTAL               → total_documents
--   judgment            → judgments
--   judgment_pl         → judgments_pl
--   judgment_uk         → judgments_uk
--   tax_interpretation  → tax_interpretations
--   tax_interpretation_pl → tax_interpretations_pl
--   tax_interpretation_uk → tax_interpretations_uk
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.doc_type_stats (
    doc_type   TEXT        PRIMARY KEY,
    count      INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.doc_type_stats IS
    'Legacy pre-computed document-type counts consumed by backend/app/dashboard.py. '
    'Rebuilt by refresh_dashboard_stats().';

ALTER TABLE public.doc_type_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on doc_type_stats"
    ON public.doc_type_stats;

CREATE POLICY "Service role full access on doc_type_stats"
    ON public.doc_type_stats
    FOR ALL
    USING  (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.doc_type_stats TO service_role;


-- =============================================================================
-- 3. refresh_dashboard_stats()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
    TRUNCATE public.dashboard_precomputed_stats;

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
    );

    -- judgments_by_jurisdiction
    INSERT INTO public.dashboard_precomputed_stats (stat_key, stat_value, category, computed_at)
    VALUES (
        'judgments_by_jurisdiction',
        jsonb_build_object('PL', v_total_pl, 'UK', v_total_uk),
        'counts',
        v_now
    );

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
    ) sub;

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
    ) sub;

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
    ) sub;

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
    WHERE decision_date IS NOT NULL;

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
    ) sub;

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
    ) sub;

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
    ) sub;

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
    FROM public.judgments;

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
    ) sub;

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
    ) sub;

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
    ) sub;

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
    FROM public.judgments;

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
    ) sub;

    -- =========================================================================
    -- doc_type_stats  (legacy table)
    -- =========================================================================
    TRUNCATE public.doc_type_stats;

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
        ('tax_interpretation_uk',  0,          v_now);

END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_stats() IS
    'Rebuild both dashboard_precomputed_stats and doc_type_stats from the current '
    'state of public.judgments.  Safe to call repeatedly (idempotent via TRUNCATE).';

-- Grant execution to service_role so the backend can trigger a rebuild
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO service_role;


-- =============================================================================
-- 4. Initial population
-- =============================================================================

SELECT public.refresh_dashboard_stats();

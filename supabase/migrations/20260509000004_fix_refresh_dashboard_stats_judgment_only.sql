-- Redefine `public.refresh_dashboard_stats()` so it no longer re-seeds the
-- three `tax_interpretation*` rows in `public.doc_type_stats`.
--
-- Background: search and dashboard are now judgment-only as of 2026-05-09
-- (see `docs/superpowers/specs/2026-05-09-search-judgment-only-blazing-fast.md`).
-- Migration 20260509000003_drop_tax_interpretation_dashboard_stats.sql deletes
-- the legacy rows from `doc_type_stats` and `dashboard_precomputed_stats`,
-- but `refresh_dashboard_stats()` (defined in
-- 20260325000001_create_dashboard_precomputed_stats.sql lines 105-535)
-- TRUNCATEs `doc_type_stats` and re-INSERTs from a static VALUES list that
-- still contained the three tax_interpretation* rows. The next call to the
-- function would therefore re-seed the rows we just deleted.
--
-- This migration uses `CREATE OR REPLACE FUNCTION` to redefine the function
-- with the tax_interpretation* VALUES rows removed. The rest of the function
-- body — the `dashboard_precomputed_stats` rebuild plus the judgment/jurisdiction
-- VALUES rows in `doc_type_stats` — is reproduced verbatim from the source
-- migration so the precomputed analytics keep working.

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
    -- doc_type_stats  (legacy table, judgment-only as of 2026-05-09)
    -- =========================================================================
    -- The three tax_interpretation* rows that previously lived here have been
    -- removed; search and dashboard are judgment-only and the data was
    -- always 0 anyway (tax_interpretations are not stored in `judgments`).
    TRUNCATE public.doc_type_stats;

    INSERT INTO public.doc_type_stats (doc_type, count, created_at)
    VALUES
        -- Grand total
        ('TOTAL',                  v_total,    v_now),
        -- All judgments regardless of jurisdiction
        ('judgment',               v_total,    v_now),
        -- By jurisdiction
        ('judgment_pl',            v_total_pl, v_now),
        ('judgment_uk',            v_total_uk, v_now);

END;
$$;

-- Re-run once now so the previously seeded tax_interpretation* rows do not
-- come back the next time anything calls refresh_dashboard_stats().
SELECT public.refresh_dashboard_stats();

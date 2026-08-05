-- Add jurisdiction-scoped dashboard distributions without rewriting the
-- historical refresh implementation. The existing, upsert-based function is
-- retained as an internal base and this public entry point corrects the two
-- jurisdiction-sensitive statistics after the base refresh completes.

ALTER FUNCTION public.refresh_dashboard_stats()
    RENAME TO refresh_dashboard_stats_base;

ALTER FUNCTION public.refresh_dashboard_stats_base()
    SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats_base() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
BEGIN
    PERFORM public.refresh_dashboard_stats_base();

    -- Keep the 15 most represented courts independently for each supported
    -- jurisdiction. A global LIMIT hides one jurisdiction when corpus sizes
    -- differ significantly.
    INSERT INTO public.dashboard_precomputed_stats (
        stat_key,
        stat_value,
        category,
        computed_at
    )
    SELECT
        'top_courts',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', court_name,
                    'count', cnt,
                    'jurisdiction', jurisdiction
                )
                ORDER BY jurisdiction, court_rank
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            jurisdiction,
            court_name,
            cnt,
            ROW_NUMBER() OVER (
                PARTITION BY jurisdiction
                ORDER BY cnt DESC, court_name
            ) AS court_rank
        FROM (
            SELECT
                jurisdiction,
                court_name,
                COUNT(*) AS cnt
            FROM public.judgments
            WHERE jurisdiction IN ('PL', 'UK')
              AND court_name IS NOT NULL
            GROUP BY jurisdiction, court_name
        ) AS court_counts
    ) AS ranked_courts
    WHERE court_rank <= 15
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value = EXCLUDED.stat_value,
        category = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;

    INSERT INTO public.dashboard_precomputed_stats (
        stat_key,
        stat_value,
        category,
        computed_at
    )
    SELECT
        'decisions_per_year_by_jurisdiction',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'year', yr,
                    'count', cnt,
                    'jurisdiction', jurisdiction
                )
                ORDER BY yr, jurisdiction
            ),
            '[]'::jsonb
        ),
        'distribution',
        v_now
    FROM (
        SELECT
            EXTRACT(YEAR FROM decision_date)::INT AS yr,
            jurisdiction,
            COUNT(*) AS cnt
        FROM public.judgments
        WHERE decision_date IS NOT NULL
          AND jurisdiction IN ('PL', 'UK')
        GROUP BY yr, jurisdiction
    ) AS yearly_counts
    ON CONFLICT (stat_key) DO UPDATE SET
        stat_value = EXCLUDED.stat_value,
        category = EXCLUDED.category,
        computed_at = EXCLUDED.computed_at;
END;
$$;

COMMENT ON FUNCTION public.refresh_dashboard_stats() IS
    'Refresh dashboard statistics, including top courts and annual counts '
    'scoped independently to PL and UK.';

REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO service_role;

SELECT public.refresh_dashboard_stats();

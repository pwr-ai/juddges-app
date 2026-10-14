-- =============================================================================
-- Fix: get_judgment_facets raised 42702 "column reference facet_type is
-- ambiguous" and returned no facets (surfaced as HTTP 500 on GET
-- /documents/facets).
--
-- Cause: the function's RETURNS TABLE columns (facet_type, facet_value,
-- facet_count) are PL/pgSQL OUT variables. The all_pairs CTE referenced
-- facet_type / facet_value UNqualified, so PostgreSQL could not tell the CTE
-- column from the OUT variable of the same name.
--
-- Fix: add `#variable_conflict use_column` so unqualified names in the body
-- resolve to columns. Output contract is unchanged: (facet_type, facet_value,
-- facet_count). CREATE OR REPLACE — idempotent and reversible.
-- =============================================================================

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
#variable_conflict use_column
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
        SELECT scalar_pairs.facet_type, scalar_pairs.facet_value FROM scalar_pairs
        UNION ALL
        SELECT array_pairs.facet_type, array_pairs.facet_value FROM array_pairs
    )
    SELECT
        ap.facet_type,
        ap.facet_value,
        COUNT(*)::bigint AS facet_count
    FROM all_pairs ap
    GROUP BY ap.facet_type, ap.facet_value
    HAVING ap.facet_type NOT IN ('keyword', 'legal_topic') OR COUNT(*) > 1;
END;
$$;

COMMENT ON FUNCTION public.get_judgment_facets IS
    'Returns aggregated counts for each filter option in a SINGLE pass over '
    'judgments. Output: (facet_type, facet_value, facet_count). Supports '
    'optional pre-filtering by jurisdiction and date range. keyword/legal_topic '
    'facets require count > 1. #variable_conflict use_column resolves the '
    'OUT-param vs column name clash (was 42702).';

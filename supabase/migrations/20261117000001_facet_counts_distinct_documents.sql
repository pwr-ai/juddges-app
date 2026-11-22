-- =============================================================================
-- Migration: facet counts per jurisdiction count DOCUMENTS, not array elements
-- =============================================================================
-- Fixes #886: /compare showed shares above 100% (e.g. 350%) because, for
-- text[] fields, the value rows counted unnested elements. A document that
-- repeats a value inside one array was counted once per occurrence, while the
-- share denominator (`covered`) counts documents.
--
-- Semantics: count = number of DISTINCT matched documents holding the value;
-- share = count / covered, therefore always <= 1.
--
-- Signature, return type, security settings and grants are unchanged
-- (CREATE OR REPLACE keeps the existing ACL, so no GRANT is repeated here).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_extracted_facet_counts_by_jurisdiction(
    p_filters JSONB DEFAULT '{}'::jsonb,
    field_path TEXT DEFAULT NULL,
    p_text_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    jurisdiction TEXT,
    value TEXT,
    count BIGINT,
    total BIGINT,
    covered BIGINT,
    coverage NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_column TEXT;
    v_udt_name TEXT;
    v_filled_sql TEXT;
    v_values_sql TEXT;
BEGIN
    v_column := public._base_field_to_column(field_path);
    IF v_column IS NULL THEN
        RAISE EXCEPTION 'Unknown extracted field: %', field_path;
    END IF;

    SELECT c.udt_name INTO v_udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'judgments' AND c.column_name = v_column;

    IF v_udt_name IS NULL THEN
        RAISE EXCEPTION 'Column not found for extracted field: %', field_path;
    END IF;

    IF v_udt_name = '_text' THEN
        v_filled_sql := format(
            $f$EXISTS (SELECT 1 FROM unnest(j.%1$I) AS e WHERE e IS NOT NULL AND e <> '')$f$,
            v_column);
        v_values_sql := format(
            $v$SELECT j.id, j.jurisdiction, e::text AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               CROSS JOIN LATERAL unnest(j.%1$I) AS e
               WHERE e IS NOT NULL AND e <> ''$v$,
            v_column);
    ELSIF v_udt_name = 'text' THEN
        v_filled_sql := format($f$NULLIF(BTRIM(j.%1$I), '') IS NOT NULL$f$, v_column);
        v_values_sql := format(
            $v$SELECT j.id, j.jurisdiction, j.%1$I AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               WHERE NULLIF(BTRIM(j.%1$I), '') IS NOT NULL$v$,
            v_column);
    ELSE
        v_filled_sql := format($f$j.%1$I IS NOT NULL$f$, v_column);
        v_values_sql := format(
            $v$SELECT j.id, j.jurisdiction, j.%1$I::text AS value
               FROM matched m
               JOIN public.judgments j ON j.id = m.id
               WHERE j.%1$I IS NOT NULL$v$,
            v_column);
    END IF;

    RETURN QUERY EXECUTE format(
        $q$
        WITH matched AS (
            SELECT m.id, m.jurisdiction
            FROM public.list_extracted_filter_matches($1, $2) AS m
        ),
        totals AS (
            SELECT
                m.jurisdiction,
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE %1$s)::bigint AS covered
            FROM matched m
            JOIN public.judgments j ON j.id = m.id
            GROUP BY m.jurisdiction
        ),
        vals AS (
            SELECT v.jurisdiction, v.value, COUNT(DISTINCT v.id)::bigint AS count
            FROM (%2$s) AS v
            GROUP BY v.jurisdiction, v.value
        )
        SELECT
            t.jurisdiction,
            v.value,
            v.count,
            t.total,
            t.covered,
            ROUND(t.covered::numeric / NULLIF(t.total, 0), 4) AS coverage
        FROM totals t
        LEFT JOIN vals v ON v.jurisdiction = t.jurisdiction
        ORDER BY t.jurisdiction, v.count DESC NULLS LAST, v.value
        $q$,
        v_filled_sql,
        v_values_sql
    ) USING p_filters, p_text_query;
END;
$$;

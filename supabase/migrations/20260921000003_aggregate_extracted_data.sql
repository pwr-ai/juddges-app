-- aggregate_extracted_data (#707, spec §5.1)
--
-- Per-field distributions over a cohort, optionally over a seeded random
-- sample of it. The cohort is list_extracted_filter_matches (#682) — no
-- predicate is repeated here. Field → column → kind dispatch follows
-- get_numeric_field_histogram (20260514000001): information_schema udt_name
-- decides how a column is aggregated, format(%I) quotes it.
--
-- Return shape (JSONB):
-- { total, sample_n, seed,
--   fields: { <field>: {kind:'categorical', values:[{value,count}], other, null, covered, multi}
--                   | {kind:'numeric', buckets:[{lo,hi,count}], null, covered, min, max}
--                   | {kind:'year', values:[{value,count}], null, covered} } }

CREATE OR REPLACE FUNCTION public._aggregate_column_for_field(p_field TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_field IN ('jurisdiction', 'decision_date', 'court_name') THEN p_field
        WHEN p_field LIKE 'deep\_%' ESCAPE '\' THEN p_field
        ELSE public._base_field_to_column(p_field)
    END;
$$;

CREATE OR REPLACE FUNCTION public.aggregate_extracted_data(
    p_filters     JSONB   DEFAULT '{}'::jsonb,
    p_text_query  TEXT    DEFAULT NULL,
    p_fields      TEXT[]  DEFAULT NULL,
    p_sample_size INT     DEFAULT NULL,
    p_seed        INT     DEFAULT NULL,
    p_top_n       INT     DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_fields   TEXT[] := COALESCE(p_fields, ARRAY[
        'offender_age_offence', 'offender_gender', 'convict_offences', 'sentences_received',
        'appeal_outcome', 'did_offender_confess', 'court_name', 'decision_date']);
    v_ids      UUID[];
    v_total    BIGINT := 0;
    v_sample_n INT := 0;
    v_field    TEXT;
    v_column   TEXT;
    v_udt      TEXT;
    v_part     JSONB;
    v_out      JSONB := '{}'::jsonb;
BEGIN
    IF p_sample_size IS NOT NULL AND p_seed IS NULL THEN
        RAISE EXCEPTION 'p_seed is required when p_sample_size is set' USING ERRCODE = '22023';
    END IF;
    IF p_sample_size IS NOT NULL AND p_sample_size < 1 THEN
        RAISE EXCEPTION 'p_sample_size must be >= 1' USING ERRCODE = '22023';
    END IF;
    IF p_top_n < 1 OR p_top_n > 100 THEN
        RAISE EXCEPTION 'p_top_n must be between 1 and 100' USING ERRCODE = '22023';
    END IF;

    -- Cohort + deterministic order. Same cohort and seed => same sample.
    SELECT COUNT(*), array_agg(m.id ORDER BY md5(m.id::text || COALESCE(p_seed::text, '')), m.id)
      INTO v_total, v_ids
      FROM public.list_extracted_filter_matches(p_filters, p_text_query) m;

    IF v_ids IS NULL THEN
        v_ids := ARRAY[]::UUID[];
    END IF;
    IF p_sample_size IS NOT NULL THEN
        v_ids := v_ids[1:p_sample_size];
    END IF;
    v_sample_n := COALESCE(array_length(v_ids, 1), 0);

    FOREACH v_field IN ARRAY v_fields LOOP
        v_column := public._aggregate_column_for_field(v_field);
        SELECT c.udt_name INTO v_udt
          FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'judgments' AND c.column_name = v_column;
        IF v_udt IS NULL THEN
            RAISE EXCEPTION 'field % is not aggregable', v_field USING ERRCODE = '22023';
        END IF;

        IF v_udt = '_text' THEN
            -- array column: one row per value; "multi": a judgment can appear under several values
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     v AS (SELECT x AS value, COUNT(*) AS cnt FROM s, LATERAL unnest(s.col) AS x GROUP BY x),
                     r AS (SELECT value, cnt, ROW_NUMBER() OVER (ORDER BY cnt DESC, value) AS rn FROM v)
                SELECT jsonb_build_object(
                    'kind', 'categorical', 'multi', true,
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'count', cnt) ORDER BY rn) FROM r WHERE rn <= $2), '[]'::jsonb),
                    'other', COALESCE((SELECT SUM(cnt) FROM r WHERE rn > $2), 0),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL OR cardinality(col) = 0),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL AND cardinality(col) > 0))
            $q$, v_column) INTO v_part USING v_ids, p_top_n;

        ELSIF v_udt IN ('text', 'bool', 'varchar') THEN
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I::text AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     v AS (SELECT col AS value, COUNT(*) AS cnt FROM s WHERE col IS NOT NULL AND col <> '' GROUP BY col),
                     r AS (SELECT value, cnt, ROW_NUMBER() OVER (ORDER BY cnt DESC, value) AS rn FROM v)
                SELECT jsonb_build_object(
                    'kind', 'categorical', 'multi', false,
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', value, 'count', cnt) ORDER BY rn) FROM r WHERE rn <= $2), '[]'::jsonb),
                    'other', COALESCE((SELECT SUM(cnt) FROM r WHERE rn > $2), 0),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL OR col = ''),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL AND col <> ''))
            $q$, v_column) INTO v_part USING v_ids, p_top_n;

        ELSIF v_udt IN ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') THEN
            -- 20 equal-width buckets between min and max of the sample; a single
            -- distinct value yields one bucket [v, v].
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I::numeric AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     b AS (SELECT MIN(col) AS lo, MAX(col) AS hi FROM s WHERE col IS NOT NULL),
                     w AS (SELECT lo, hi, CASE WHEN hi > lo THEN 20 ELSE 1 END AS n FROM b),
                     k AS (SELECT s.col,
                                  CASE WHEN w.hi > w.lo
                                       THEN LEAST(width_bucket(s.col, w.lo, w.hi, w.n), w.n)
                                       ELSE 1 END AS bk
                             FROM s, w WHERE s.col IS NOT NULL),
                     g AS (SELECT bk, COUNT(*) AS cnt FROM k GROUP BY bk),
                     e AS (SELECT gs AS bk,
                                  w.lo + (w.hi - w.lo) * (gs - 1) / w.n AS lo,
                                  CASE WHEN gs = w.n THEN w.hi ELSE w.lo + (w.hi - w.lo) * gs / w.n END AS hi
                             FROM w, generate_series(1, w.n) AS gs
                            WHERE w.lo IS NOT NULL)  -- no non-null value => buckets: []
                SELECT jsonb_build_object(
                    'kind', 'numeric',
                    'buckets', COALESCE((SELECT jsonb_agg(jsonb_build_object('lo', e.lo, 'hi', e.hi, 'count', COALESCE(g.cnt, 0)) ORDER BY e.bk)
                                         FROM e LEFT JOIN g USING (bk)), '[]'::jsonb),
                    'min', (SELECT lo FROM b), 'max', (SELECT hi FROM b),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL))
            $q$, v_column) INTO v_part USING v_ids;

        ELSIF v_udt IN ('date', 'timestamp', 'timestamptz') THEN
            EXECUTE format($q$
                WITH s AS (SELECT j.%1$I AS col FROM public.judgments j WHERE j.id = ANY($1)),
                     y AS (SELECT EXTRACT(YEAR FROM col)::int AS yr, COUNT(*) AS cnt FROM s WHERE col IS NOT NULL GROUP BY 1)
                SELECT jsonb_build_object(
                    'kind', 'year',
                    'values', COALESCE((SELECT jsonb_agg(jsonb_build_object('value', yr::text, 'count', cnt) ORDER BY yr) FROM y), '[]'::jsonb),
                    'null', (SELECT COUNT(*) FROM s WHERE col IS NULL),
                    'covered', (SELECT COUNT(*) FROM s WHERE col IS NOT NULL))
            $q$, v_column) INTO v_part USING v_ids;

        ELSE
            RAISE EXCEPTION 'field % is not aggregable (column type %)', v_field, v_udt USING ERRCODE = '22023';
        END IF;

        v_out := v_out || jsonb_build_object(v_field, v_part);
    END LOOP;

    RETURN jsonb_build_object('total', v_total, 'sample_n', v_sample_n, 'seed', p_seed, 'fields', v_out);
END;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon at CREATE
-- time, so PUBLIC alone is not enough: name anon (cf. 20260805000001).
REVOKE ALL ON FUNCTION public._aggregate_column_for_field(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._aggregate_column_for_field(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.aggregate_extracted_data(JSONB, TEXT, TEXT[], INT, INT, INT) IS
    'Per-field distributions over list_extracted_filter_matches, optionally over a seeded sample (#707).';

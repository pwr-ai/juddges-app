-- =============================================================================
-- Migration: numeric distribution histogram RPC for range filters (issue #140)
--
-- Adds `get_numeric_field_histogram(field, bucket_count)` returning equal-width
-- buckets with counts for the numeric base-schema fields used by the range
-- filters on /search/extractions (`co_def_acc_num`, `num_victims`,
-- `victim_age_offence`, `case_number`).
--
-- Parity with the other extraction RPCs:
--   * resolves field -> column via public._base_field_to_column
--   * restricted to base_extraction_status = 'completed'
--   * granted to anon, authenticated, service_role
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_numeric_field_histogram(
    field TEXT,
    bucket_count INT DEFAULT 20
)
RETURNS TABLE (
    bucket_lo NUMERIC,
    bucket_hi NUMERIC,
    cnt BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_column TEXT;
    v_udt_name TEXT;
    v_buckets INT;
    v_min NUMERIC;
    v_max NUMERIC;
    v_width NUMERIC;
BEGIN
    -- Clamp bucket count into a sane range (default ~20 per acceptance criteria).
    v_buckets := GREATEST(LEAST(COALESCE(bucket_count, 20), 100), 1);

    v_column := public._base_field_to_column(field);
    IF v_column IS NULL THEN
        RAISE EXCEPTION 'Unknown extracted field: %', field;
    END IF;

    SELECT c.udt_name
    INTO v_udt_name
    FROM information_schema.columns c
    WHERE
        c.table_schema = 'public'
        AND c.table_name = 'judgments'
        AND c.column_name = v_column;

    IF v_udt_name IS NULL THEN
        RAISE EXCEPTION 'Column not found for extracted field: %', field;
    END IF;

    -- Only numeric columns are histogrammable.
    IF v_udt_name NOT IN ('numeric', 'int2', 'int4', 'int8', 'float4', 'float8') THEN
        RAISE EXCEPTION 'Field % is not numeric (udt=%)', field, v_udt_name;
    END IF;

    -- Resolve the data range over the completed corpus.
    EXECUTE format(
        $q$
        SELECT MIN(j.%1$I)::numeric, MAX(j.%1$I)::numeric
        FROM public.judgments j
        WHERE j.base_extraction_status = 'completed'
          AND j.%1$I IS NOT NULL
        $q$,
        v_column
    )
    INTO v_min, v_max;

    -- No data: return nothing.
    IF v_min IS NULL OR v_max IS NULL THEN
        RETURN;
    END IF;

    -- Degenerate range (single value across the corpus): one bucket.
    IF v_max <= v_min THEN
        RETURN QUERY EXECUTE format(
            $q$
            SELECT
                %2$L::numeric AS bucket_lo,
                %2$L::numeric AS bucket_hi,
                COUNT(*)::bigint AS cnt
            FROM public.judgments j
            WHERE j.base_extraction_status = 'completed'
              AND j.%1$I IS NOT NULL
            $q$,
            v_column,
            v_min
        );
        RETURN;
    END IF;

    v_width := (v_max - v_min) / v_buckets;

    -- width_bucket assigns each value to bucket 1..v_buckets. The series
    -- backfills empty buckets with cnt = 0 so the frontend renders a continuous
    -- distribution. Bucket N's [lo, hi) span is [min + (N-1)*width, min + N*width].
    RETURN QUERY EXECUTE format(
        $q$
        WITH series AS (
            SELECT
                gs AS bucket_idx,
                (%2$L::numeric + (gs - 1) * %4$L::numeric) AS lo,
                (%2$L::numeric + gs * %4$L::numeric) AS hi
            FROM generate_series(1, %5$L::int) AS gs
        ),
        assigned AS (
            SELECT
                LEAST(
                    width_bucket(j.%1$I::numeric, %2$L::numeric, %3$L::numeric, %5$L::int),
                    %5$L::int
                ) AS bucket_idx
            FROM public.judgments j
            WHERE j.base_extraction_status = 'completed'
              AND j.%1$I IS NOT NULL
        )
        SELECT
            s.lo AS bucket_lo,
            s.hi AS bucket_hi,
            COUNT(a.bucket_idx)::bigint AS cnt
        FROM series s
        LEFT JOIN assigned a ON a.bucket_idx = s.bucket_idx
        GROUP BY s.bucket_idx, s.lo, s.hi
        ORDER BY s.bucket_idx
        $q$,
        v_column,  -- %1
        v_min,     -- %2
        v_max,     -- %3
        v_width,   -- %4
        v_buckets  -- %5
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_numeric_field_histogram(TEXT, INT)
    TO anon, authenticated, service_role;

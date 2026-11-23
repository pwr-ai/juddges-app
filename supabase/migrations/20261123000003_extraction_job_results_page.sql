-- Paginated read of one extraction job's results.
--
-- `extraction_jobs.results` is a single JSONB array per job. Corpus-wide jobs
-- hold ~6k entries (~15 MB), and `GET /extractions/{job_id}` shipped the whole
-- array through PostgREST on every detail-page load, which timed out (504) and
-- overloaded the small production instance. This RPC slices the array inside
-- Postgres so only the requested page leaves the database, together with the
-- totals the page needs to render its pager and status tabs.
--
-- Backend-only RPC: executable by service_role only. The caller passes the
-- authenticated user's id and the function filters on it, so a job owned by
-- someone else is indistinguishable from a missing one (`found = false`).
--
-- Return shape:
--   {"found": bool, "total": int, "filtered_total": int,
--    "counts": {"completed": int, "failed": int, "other": int},
--    "items": [<result>, ...]}
-- `counts` and `total` cover the whole array; `filtered_total` honours
-- `p_status` and is what the pager pages over.

CREATE OR REPLACE FUNCTION public.get_extraction_job_results_page(
    p_job_id text,
    p_user_id uuid,
    p_offset int,
    p_limit int,
    p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH job AS (
        SELECT j.results
          FROM public.extraction_jobs j
         WHERE j.job_id = p_job_id
           AND j.user_id = p_user_id
    ),
    elems AS (
        SELECT e.item,
               e.ord,
               CASE
                   WHEN lower(coalesce(e.item ->> 'status', '')) IN ('completed', 'success')
                       THEN 'completed'
                   WHEN lower(coalesce(e.item ->> 'status', '')) IN ('failed', 'failure')
                       THEN 'failed'
                   ELSE 'other'
               END AS bucket
          FROM job
         CROSS JOIN LATERAL jsonb_array_elements(
                  CASE WHEN jsonb_typeof(job.results) = 'array'
                       THEN job.results
                       ELSE '[]'::jsonb
                  END
              ) WITH ORDINALITY AS e(item, ord)
    ),
    matched AS (
        SELECT item, ord
          FROM elems
         WHERE p_status IS NULL OR bucket = lower(p_status)
    ),
    page AS (
        SELECT item, ord
          FROM matched
         ORDER BY ord
        OFFSET greatest(coalesce(p_offset, 0), 0)
         LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    SELECT jsonb_build_object(
        'found', EXISTS (SELECT 1 FROM job),
        'total', (SELECT count(*) FROM elems),
        'filtered_total', (SELECT count(*) FROM matched),
        'counts', jsonb_build_object(
            'completed', (SELECT count(*) FROM elems WHERE bucket = 'completed'),
            'failed', (SELECT count(*) FROM elems WHERE bucket = 'failed'),
            'other', (SELECT count(*) FROM elems WHERE bucket = 'other')
        ),
        'items', coalesce(
            (SELECT jsonb_agg(page.item ORDER BY page.ord) FROM page),
            '[]'::jsonb
        )
    );
$$;

REVOKE ALL ON FUNCTION public.get_extraction_job_results_page(text, uuid, int, int, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_extraction_job_results_page(text, uuid, int, int, text)
    TO service_role;

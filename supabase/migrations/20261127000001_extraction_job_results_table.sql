-- One row per extraction-job result, kept in sync with extraction_jobs.results.
--
-- `extraction_jobs.results` is a single JSONB array per job. Corpus-wide jobs
-- hold ~6k entries (~15 MB), so every reader that needs a slice of it -- the
-- paged results RPC, export, the compare tally -- had to detoast the whole
-- value first (0.4-1.6 s per page on the production instance). This table holds
-- the same entries one row each, indexed by (job_id, bucket, position), so a
-- page or a keyset scan reads only the rows it returns.
--
-- Writers are unchanged: the Celery worker keeps rewriting extraction_jobs.results
-- after every document, and an AFTER trigger mirrors the array into this table.
-- The mirror is an upsert by position that skips unchanged rows, so a worker
-- that appends one result per write touches one row here, not the whole job.
--
-- extraction_jobs.results stays the source of truth; this table is derived and
-- can be rebuilt with public.sync_extraction_job_results(job_id) at any time.
--
-- Backend-only: RLS on with no policies, and no grants to anon/authenticated.
-- The backend reads it with the service role after checking job ownership.

-- Fail fast instead of queueing every extraction_jobs reader behind the DDL
-- locks if a worker write is in flight.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.extraction_job_results (
    job_id      text    NOT NULL
                REFERENCES public.extraction_jobs (job_id)
                ON DELETE CASCADE ON UPDATE CASCADE,
    -- 1-based position in extraction_jobs.results (WITH ORDINALITY).
    position    integer NOT NULL CHECK (position >= 1),
    document_id text,
    -- 'completed' | 'failed' | 'other'; see extraction_result_bucket().
    bucket      text    NOT NULL,
    item        jsonb   NOT NULL,
    PRIMARY KEY (job_id, position)
);

CREATE INDEX IF NOT EXISTS idx_extraction_job_results_bucket
    ON public.extraction_job_results (job_id, bucket, position);

ALTER TABLE public.extraction_job_results ENABLE ROW LEVEL SECURITY;
-- service_role reads it; only the sync functions (as owner) write it.
REVOKE ALL ON TABLE public.extraction_job_results
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.extraction_job_results TO service_role;

-- Status bucket of one stored result. Same mapping the paged RPC used:
-- 'success'/'partially_completed' count as completed, 'failure' as failed.
CREATE OR REPLACE FUNCTION public.extraction_result_bucket(p_item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN lower(coalesce(p_item ->> 'status', '')) IN ('completed', 'success', 'partially_completed')
            THEN 'completed'
        WHEN lower(coalesce(p_item ->> 'status', '')) IN ('failed', 'failure')
            THEN 'failed'
        ELSE 'other'
    END;
$$;

-- Mirror one job's results array into extraction_job_results.
-- Upserts only positions whose item is new or changed (filtered before the
-- INSERT, so unchanged rows are never locked or WAL-logged), and drops
-- positions past the end of the array (results shrank or became NULL).
CREATE OR REPLACE FUNCTION public.sync_extraction_job_results_from(
    p_job_id text,
    p_results jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_results jsonb := CASE WHEN jsonb_typeof(p_results) = 'array'
                            THEN p_results ELSE '[]'::jsonb END;
BEGIN
    INSERT INTO public.extraction_job_results AS r
        (job_id, position, document_id, bucket, item)
    SELECT p_job_id,
           e.ord::integer,
           e.item ->> 'document_id',
           public.extraction_result_bucket(e.item),
           e.item
      FROM jsonb_array_elements(v_results) WITH ORDINALITY AS e(item, ord)
      LEFT JOIN public.extraction_job_results x
             ON x.job_id = p_job_id
            AND x.position = e.ord
     WHERE x.item IS DISTINCT FROM e.item
    ON CONFLICT (job_id, position) DO UPDATE
       SET document_id = EXCLUDED.document_id,
           bucket      = EXCLUDED.bucket,
           item        = EXCLUDED.item;

    DELETE FROM public.extraction_job_results d
     WHERE d.job_id = p_job_id
       AND d.position > jsonb_array_length(v_results);
END;
$$;

-- Rebuild the mirror for one job from its stored array (repair / backfill).
CREATE OR REPLACE FUNCTION public.sync_extraction_job_results(p_job_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.sync_extraction_job_results_from(j.job_id, j.results)
      FROM public.extraction_jobs j
     WHERE j.job_id = p_job_id;
$$;

CREATE OR REPLACE FUNCTION public.trg_extraction_jobs_sync_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.sync_extraction_job_results_from(NEW.job_id, NEW.results);
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_extraction_job_results_from(text, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_extraction_job_results(text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_extraction_jobs_sync_results()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_extraction_job_results(text) TO service_role;

CREATE OR REPLACE TRIGGER trg_extraction_jobs_sync_results_ins
    AFTER INSERT ON public.extraction_jobs
    FOR EACH ROW
    WHEN (NEW.results IS NOT NULL)
    EXECUTE FUNCTION public.trg_extraction_jobs_sync_results();

CREATE OR REPLACE TRIGGER trg_extraction_jobs_sync_results_upd
    AFTER UPDATE OF results ON public.extraction_jobs
    FOR EACH ROW
    WHEN (NEW.results IS DISTINCT FROM OLD.results)
    EXECUTE FUNCTION public.trg_extraction_jobs_sync_results();

-- Backfill every existing job. Reads extraction_jobs only; never updates it,
-- so the updated_at trigger does not fire and /api/jobs does not re-poll Celery.
-- Apply while no extraction job is running: a worker write that commits
-- between this statement's snapshot and its upsert would be overwritten with
-- the older array (it heals on that job's next write).
SELECT public.sync_extraction_job_results_from(j.job_id, j.results)
  FROM public.extraction_jobs j
 WHERE j.results IS NOT NULL;

-- Paged RPC: same signature and return shape as 20261123000004, now served
-- from the per-row table instead of slicing the JSONB array.
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
        SELECT j.job_id
          FROM public.extraction_jobs j
         WHERE j.job_id = p_job_id
           AND j.user_id = p_user_id
    ),
    counts AS (
        SELECT r.bucket, count(*) AS n
          FROM public.extraction_job_results r
          JOIN job ON job.job_id = r.job_id
         GROUP BY r.bucket
    ),
    page AS (
        SELECT r.item, r.position
          FROM public.extraction_job_results r
          JOIN job ON job.job_id = r.job_id
         WHERE p_status IS NULL OR r.bucket = lower(p_status)
         ORDER BY r.position
        OFFSET greatest(coalesce(p_offset, 0), 0)
         LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    SELECT jsonb_build_object(
        'found', EXISTS (SELECT 1 FROM job),
        'total', coalesce((SELECT sum(n) FROM counts), 0)::bigint,
        'filtered_total', coalesce(
            (SELECT sum(n) FROM counts
              WHERE p_status IS NULL OR bucket = lower(p_status)),
            0
        )::bigint,
        'counts', jsonb_build_object(
            'completed', coalesce((SELECT n FROM counts WHERE bucket = 'completed'), 0),
            'failed', coalesce((SELECT n FROM counts WHERE bucket = 'failed'), 0),
            'other', coalesce((SELECT n FROM counts WHERE bucket = 'other'), 0)
        ),
        'items', coalesce(
            (SELECT jsonb_agg(page.item ORDER BY page.position) FROM page),
            '[]'::jsonb
        )
    );
$$;

REVOKE ALL ON FUNCTION public.get_extraction_job_results_page(text, uuid, int, int, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_extraction_job_results_page(text, uuid, int, int, text)
    TO service_role;

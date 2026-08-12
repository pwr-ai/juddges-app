-- Brings `extraction_jobs` under version control (#437).
--
-- The table was never created by a migration and does not exist in the live
-- project, so every write from the extraction pipeline has been failing
-- silently: `_update_job_results_in_supabase` logs "No rows updated", the BFF
-- swallows its INSERT error, and `GET /extraction/jobs/{id}` degrades to a 503
-- once Celery drops the task state. Column names and types below are taken
-- from the existing readers and writers so no application code has to change:
--   backend/app/extraction_domain/jobs_router.py  (_JOB_*_FIELDS, list select)
--   backend/app/extraction_domain/results_router.py
--   backend/app/workers.py                       (_update_job_results_in_supabase)
--   frontend/app/api/extractions/route.ts        (INSERT payload)
--   frontend/app/api/jobs/route.ts               (status refresh UPDATE)
--
-- `schema_id` intentionally carries NO foreign key: the referenced
-- `extraction_schemas` table does not exist yet either. Add the constraint in
-- the migration that introduces it.

CREATE TABLE IF NOT EXISTS public.extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The Celery task id. Every query in the codebase keys on this, not on id.
    job_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- SET NULL rather than CASCADE: a finished job's results stay meaningful
    -- after the collection is gone, and readers already treat this as nullable.
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
    schema_id UUID,

    -- Constrained to the four values the application maps onto. `simplify_job_status`
    -- and the CANCELLED -> FAILURE mapping in extraction_domain/shared.py assume
    -- exactly this set; widening it without touching that mapping would break
    -- status reporting.
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'STARTED', 'SUCCESS', 'FAILURE')),

    document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_documents INTEGER NOT NULL DEFAULT 0 CHECK (total_documents >= 0),
    completed_documents INTEGER NOT NULL DEFAULT 0 CHECK (completed_documents >= 0),

    language TEXT NOT NULL DEFAULT 'pl',
    prompt_id TEXT NOT NULL DEFAULT 'info_extraction',
    extraction_context TEXT,

    results JSONB,
    error_message TEXT,

    -- Lifecycle columns (#437) ------------------------------------------------
    -- Worker liveness, written only by the running task. Distinct from
    -- updated_at, which the BFF also touches on every status poll — a poll must
    -- not make a dead worker look alive to the reaper.
    heartbeat_at TIMESTAMPTZ,
    -- Cooperative cancellation. `status` cannot express this (the CHECK above
    -- has no CANCELLED value and the application maps cancellation onto
    -- FAILURE), so the request is recorded separately and the task polls it
    -- between documents instead of being SIGTERM'd mid-document.
    cancel_requested_at TIMESTAMPTZ,
    -- Incremented on each worker claim. With task_acks_late a redelivered
    -- message reruns the task, and this is the only way to see that happening.
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    -- Fingerprint of (collection, schema, documents) used to collapse a
    -- double-submit onto the in-flight job instead of paying for the LLM twice.
    idempotency_key TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Serves the paginated job list: .eq(user_id).order(created_at desc)
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user_created
    ON public.extraction_jobs(user_id, created_at DESC);

-- Serves the reaper scan for jobs whose worker stopped reporting.
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_stale
    ON public.extraction_jobs(heartbeat_at)
    WHERE status = 'STARTED';

-- Only one in-flight job per (user, fingerprint). Terminal rows are excluded so
-- re-running the same extraction later stays allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_jobs_inflight_idempotency
    ON public.extraction_jobs(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status IN ('PENDING', 'STARTED');

CREATE OR REPLACE FUNCTION public.tg_extraction_jobs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_extraction_jobs_set_updated_at ON public.extraction_jobs;
CREATE TRIGGER trg_extraction_jobs_set_updated_at
    BEFORE UPDATE ON public.extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION public.tg_extraction_jobs_set_updated_at();

-- RLS: the backend uses service_role (which bypasses RLS), so these policies
-- govern the anon/authenticated clients — i.e. the Next.js BFF acting as the
-- signed-in user. Ownership is enforced in the same predicate as the lookup, so
-- another user's job is indistinguishable from a missing one.
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extraction_jobs_owner_select ON public.extraction_jobs;
CREATE POLICY extraction_jobs_owner_select ON public.extraction_jobs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS extraction_jobs_owner_insert ON public.extraction_jobs;
CREATE POLICY extraction_jobs_owner_insert ON public.extraction_jobs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS extraction_jobs_owner_update ON public.extraction_jobs;
CREATE POLICY extraction_jobs_owner_update ON public.extraction_jobs
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS extraction_jobs_owner_delete ON public.extraction_jobs;
CREATE POLICY extraction_jobs_owner_delete ON public.extraction_jobs
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.extraction_jobs IS
    'State of record for LLM extraction jobs. The Celery result backend is a '
    'cache in front of this, not the source of truth — it expires and does not '
    'survive a broker restart.';
COMMENT ON COLUMN public.extraction_jobs.heartbeat_at IS
    'Last progress report from the running worker. NULL until the task claims '
    'the job. Compared against a staleness threshold by maintenance.reap_stale_extraction_jobs.';
COMMENT ON COLUMN public.extraction_jobs.cancel_requested_at IS
    'Set by the cancel endpoint; polled by the task between documents so it can '
    'stop at a clean boundary with partial results intact.';

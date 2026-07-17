-- Product-analytics event stream (issue: app_events + track() pipeline).
--
-- Partitioned monthly by created_at (PG17 native declarative partitioning).
-- PG17 requires the partition key in the primary key, hence PK (id, created_at).
--
-- FK to auth.users deviates from the search_analytics precedent (which dropped
-- its FK in 20260513000002 to keep analytics readable after user deletion):
-- here ON DELETE SET NULL anonymizes user_id on account deletion while keeping
-- the row for volume metrics. If FK creation ever fails on hosted Supabase,
-- fall back to a bare UUID column per the search_analytics precedent.

CREATE TABLE IF NOT EXISTS public.app_events (
    id               BIGINT GENERATED ALWAYS AS IDENTITY,
    event_name       TEXT        NOT NULL,
    user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_session_id TEXT,
    session_id       TEXT,
    surface          TEXT,        -- 'web' | 'api'
    locale           TEXT,
    app_version      TEXT,
    properties       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Parent-level (partitioned) indexes; propagated to every partition.
CREATE INDEX IF NOT EXISTS idx_app_events_name_created_at
    ON public.app_events (event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_app_events_user_id
    ON public.app_events (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_events_created_at
    ON public.app_events (created_at);

-- RLS: service role only (mirrors search_analytics post-20260623000002 form).
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on app_events"
    ON public.app_events
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Belt-and-braces: PostgREST exposes the parent as an ordinary public table.
REVOKE ALL ON public.app_events FROM anon, authenticated;

-- Idempotent monthly partition creator. Called by this migration's DO block
-- and by the Celery beat task maintenance.roll_app_events_partitions.
-- RLS is NOT inherited for direct partition access (PostgREST exposes each
-- partition as its own public table), so each partition gets deny-all RLS
-- (no policies; service_role bypasses RLS) and revoked client grants.
CREATE OR REPLACE FUNCTION public.create_app_events_partition(month_start date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    range_start date := date_trunc('month', month_start)::date;
    range_end   date := (date_trunc('month', month_start) + interval '1 month')::date;
    part_name   text := format(
        'app_events_y%sm%s',
        to_char(range_start, 'YYYY'),
        to_char(range_start, 'MM')
    );
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.app_events '
        'FOR VALUES FROM (%L) TO (%L)',
        part_name, range_start, range_end
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', part_name);
END;
$$;

-- Lockdown (mirrors 20260623000001): backend-only callable.
REVOKE EXECUTE ON FUNCTION public.create_app_events_partition(date)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_app_events_partition(date) TO service_role;

-- Bootstrap: current + next month partitions.
DO $$
BEGIN
    PERFORM public.create_app_events_partition(date_trunc('month', now())::date);
    PERFORM public.create_app_events_partition(
        (date_trunc('month', now()) + interval '1 month')::date
    );
END;
$$;

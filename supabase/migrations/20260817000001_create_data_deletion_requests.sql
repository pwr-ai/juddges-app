-- GDPR right-to-erasure request records (#504).
--
-- `POST /api/legal/data-deletion` (backend/app/api/legal.py:279) records a
-- request and `RetentionService.request_data_deletion` /
-- `process_deletion_request` read and advance it, but
-- `public.data_deletion_requests` has never existed, so the endpoint fails on its
-- insert. The last absent table from the GDPR trio.
--
-- Columns come from the callers, which are the contract:
--   the insert payload at backend/app/services/retention_service.py:263
--   the projection at :331 ("id, user_id, request_type, data_types, status")
--   the three status transitions at :345, :373, :398
--   `DataDeletionRequest` at backend/app/api/legal.py:28 (types and the 500-char
--   cap on `reason`)

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ON DELETE SET NULL, not CASCADE, and deliberately nullable.
    --
    -- A full deletion may remove the auth user this request is about. Cascading
    -- would then destroy the record that the erasure was ever requested and
    -- carried out — which is the one artefact worth keeping, both as proof the
    -- right was honoured and because `deletion_summary` is the only account of
    -- what was removed. Erasing the subject must not erase the receipt.
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    request_type TEXT NOT NULL DEFAULT 'full_deletion'
        CHECK (request_type IN ('full_deletion', 'partial_deletion', 'anonymization')),

    -- Logical data-type keys, not table names: `retention_service` maps
    -- "analytics" onto app_events and "search_queries" onto search_analytics.
    -- TEXT[] rather than jsonb because these are short flat keys and the service
    -- iterates them.
    data_types TEXT[] NOT NULL DEFAULT '{}',

    reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),

    -- The four states `process_deletion_request` moves through. 'pending' is the
    -- insert default; the service sets the rest.
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),

    -- Who ran the processing pass — an operator identifier, not a user id, so
    -- TEXT rather than a foreign key.
    processed_by TEXT,

    -- data_type -> human-readable outcome, e.g. {"audit_logs": "deleted 12 records"}.
    deletion_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Serves the operator view of outstanding work: oldest pending first.
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_pending
    ON public.data_deletion_requests(created_at)
    WHERE status = 'pending';

-- Serves "what has this user requested", and survives user_id going NULL.
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_user
    ON public.data_deletion_requests(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- RLS: the endpoint and the processing pass both use the service role. A read
-- policy for the subject is granted because GDPR entitles them to know the state
-- of their own request; note it stops matching once `user_id` is nulled by the
-- erasure it describes, which is the intended trade-off.
--
-- No client write policies: a request must be created through the endpoint so it
-- is validated and logged, and its status must only be advanced by the
-- processing pass. A client that could set status = 'completed' could mark its
-- own erasure done without anything having been erased.
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_deletion_requests_owner_select
    ON public.data_deletion_requests;
CREATE POLICY data_deletion_requests_owner_select ON public.data_deletion_requests
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- These REVOKEs are load-bearing, not decoration. Supabase runs
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role`, so a freshly created table hands every role
-- INSERT/UPDATE/DELETE before a single GRANT is written — a bare `GRANT SELECT`
-- adds nothing. Without the revoke, the only thing stopping a client from
-- setting its own request to 'completed' is the absence of a write policy, and
-- that denial is silent: the UPDATE matches zero rows and returns success.
-- Revoking makes it an error instead, and means adding a write policy later
-- cannot open writes on its own.
REVOKE ALL ON public.data_deletion_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.data_deletion_requests
    FROM authenticated;
GRANT SELECT ON public.data_deletion_requests TO authenticated;
GRANT ALL ON public.data_deletion_requests TO service_role;

COMMENT ON TABLE public.data_deletion_requests IS
    'GDPR right-to-erasure requests and their outcome. user_id is SET NULL on '
    'user deletion so the record of the erasure survives the subject it erased.';
COMMENT ON COLUMN public.data_deletion_requests.data_types IS
    'Logical keys (audit_logs, analytics, feedback, search_queries, user_consent), '
    'mapped to physical tables by RetentionService — not table names.';

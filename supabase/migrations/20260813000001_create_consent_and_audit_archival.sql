-- GDPR consent recording and audit-log archival (#484).
--
-- `app/api/consent.py` and `app/services/retention_service.py` call two RPCs
-- that no migration ever declared and that do not exist in the database, so both
-- paths answer 404 today. `user_consent` — the table the consent endpoints read
-- straight after calling the RPC — does not exist either.
--
-- Column names and types below come from the callers, which are the contract:
--   `_USER_CONSENT_COLS` at backend/app/api/consent.py:28 (the projection)
--   `ConsentUpdateRequest` at :42 (the five consent types)
--   `ConsentHistoryEntry` at :99 (the shape of each history entry)
--   `RetentionService.archive_expired_audit_logs` at
--   backend/app/services/retention_service.py:75 (mark, do not delete; return a count)

-- ---------------------------------------------------------------------------
-- user_consent
-- ---------------------------------------------------------------------------
--
-- One row per user, with a column triple per consent type rather than a row per
-- consent. That is not a modelling preference — `_USER_CONSENT_COLS` selects all
-- of them from a single row and `ConsentStatusResponse` is flat, so a row-per-
-- consent design would require rewriting both.
--
-- Note the asymmetry, which mirrors the projection exactly: professional
-- acknowledgment, terms and privacy policy each carry a `_version`;
-- data processing and marketing do not.
CREATE TABLE IF NOT EXISTS public.user_consent (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    professional_acknowledgment_accepted BOOLEAN NOT NULL DEFAULT false,
    professional_acknowledgment_date TIMESTAMPTZ,
    professional_acknowledgment_version TEXT,

    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    terms_accepted_date TIMESTAMPTZ,
    terms_accepted_version TEXT,

    privacy_policy_accepted BOOLEAN NOT NULL DEFAULT false,
    privacy_policy_accepted_date TIMESTAMPTZ,
    privacy_policy_accepted_version TEXT,

    data_processing_consent BOOLEAN NOT NULL DEFAULT false,
    data_processing_consent_date TIMESTAMPTZ,

    marketing_consent BOOLEAN NOT NULL DEFAULT false,
    marketing_consent_date TIMESTAMPTZ,

    -- Append-only record of every change. Each entry carries exactly the four
    -- keys `ConsentHistoryEntry` requires — `version` must be present even when
    -- null, because that field has no default and Pydantic would reject the
    -- entry outright.
    consent_history JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tg_user_consent_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_consent_set_updated_at ON public.user_consent;
CREATE TRIGGER trg_user_consent_set_updated_at
    BEFORE UPDATE ON public.user_consent
    FOR EACH ROW EXECUTE FUNCTION public.tg_user_consent_set_updated_at();

-- RLS: the consent endpoints reach this through `get_admin_supabase_client()`,
-- i.e. the service role, so no client policy is required for them to work. A
-- read policy is granted anyway because a user's own consent record is exactly
-- the data GDPR entitles them to see, and a future server component reading it
-- with the user's JWT should not need a migration.
--
-- No client write policies: every change must go through
-- `update_user_consent` so the history entry cannot be skipped. A direct UPDATE
-- would silently produce a consent record with no audit trail, which is the one
-- thing this table exists to prevent.
ALTER TABLE public.user_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consent_owner_select ON public.user_consent;
CREATE POLICY user_consent_owner_select ON public.user_consent
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.user_consent FROM anon;
GRANT SELECT ON public.user_consent TO authenticated;
GRANT ALL ON public.user_consent TO service_role;

COMMENT ON TABLE public.user_consent IS
    'GDPR consent state, one row per user. Written only through '
    'public.update_user_consent so every change is appended to consent_history.';

-- ---------------------------------------------------------------------------
-- update_user_consent
-- ---------------------------------------------------------------------------
--
-- Argument names are the wire contract: PostgREST matches RPC arguments BY NAME,
-- so renaming one is a 404 for `consent.py`. Do not rename.
CREATE OR REPLACE FUNCTION public.update_user_consent(
    p_user_id UUID,
    p_consent_type TEXT,
    p_accepted BOOLEAN,
    p_version TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_entry JSONB;
BEGIN
    -- Reject unknown types rather than silently recording nothing. The set
    -- mirrors ConsentUpdateRequest.consent_type; the API validates it too, but a
    -- direct RPC call would otherwise append history for a consent that no
    -- column tracks.
    IF p_consent_type NOT IN (
        'professional_acknowledgment', 'terms', 'privacy_policy',
        'data_processing', 'marketing'
    ) THEN
        RAISE EXCEPTION 'unknown consent type: %', p_consent_type
            USING ERRCODE = 'P0422';
    END IF;

    v_entry := pg_catalog.jsonb_build_object(
        'consent_type', p_consent_type,
        'accepted', p_accepted,
        'version', p_version,
        'timestamp', pg_catalog.to_char(
            v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        )
    );

    -- Upsert so the first consent for a user does not need a separate insert
    -- path. The history append is part of the same statement as the column
    -- update, so a change can never land without its audit entry.
    INSERT INTO public.user_consent AS uc (user_id, consent_history)
    VALUES (p_user_id, pg_catalog.jsonb_build_array(v_entry))
    ON CONFLICT (user_id) DO UPDATE
        SET consent_history = uc.consent_history || v_entry;

    -- Only the columns for this consent type move. A CASE expression per column
    -- would touch every column on every call and overwrite unrelated dates.
    IF p_consent_type = 'professional_acknowledgment' THEN
        UPDATE public.user_consent SET
            professional_acknowledgment_accepted = p_accepted,
            professional_acknowledgment_date = CASE WHEN p_accepted THEN v_now END,
            professional_acknowledgment_version = CASE WHEN p_accepted THEN p_version END
        WHERE user_id = p_user_id;
    ELSIF p_consent_type = 'terms' THEN
        UPDATE public.user_consent SET
            terms_accepted = p_accepted,
            terms_accepted_date = CASE WHEN p_accepted THEN v_now END,
            terms_accepted_version = CASE WHEN p_accepted THEN p_version END
        WHERE user_id = p_user_id;
    ELSIF p_consent_type = 'privacy_policy' THEN
        UPDATE public.user_consent SET
            privacy_policy_accepted = p_accepted,
            privacy_policy_accepted_date = CASE WHEN p_accepted THEN v_now END,
            privacy_policy_accepted_version = CASE WHEN p_accepted THEN p_version END
        WHERE user_id = p_user_id;
    ELSIF p_consent_type = 'data_processing' THEN
        UPDATE public.user_consent SET
            data_processing_consent = p_accepted,
            data_processing_consent_date = CASE WHEN p_accepted THEN v_now END
        WHERE user_id = p_user_id;
    ELSE
        UPDATE public.user_consent SET
            marketing_consent = p_accepted,
            marketing_consent_date = CASE WHEN p_accepted THEN v_now END
        WHERE user_id = p_user_id;
    END IF;
END;
$$;

-- SECURITY DEFINER because clients hold no write policy on user_consent — the
-- function is the only write path, which is what guarantees the history entry.
-- Granted to `authenticated` as well as the service role so a user can record
-- their own consent directly; the function pins the row to p_user_id, but note
-- it does NOT check that p_user_id is the caller. `consent.py` passes `user.id`
-- from the verified JWT. If this is ever called from a client without that
-- guarantee, add `IF p_user_id <> auth.uid() THEN RAISE` — left out here
-- because the service role legitimately writes on behalf of any user.
REVOKE ALL ON FUNCTION public.update_user_consent(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_consent(UUID, TEXT, BOOLEAN, TEXT)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.update_user_consent(UUID, TEXT, BOOLEAN, TEXT) IS
    'Records one consent change: sets the columns for p_consent_type and appends '
    'an entry to consent_history in the same statement. Raises SQLSTATE P0422 for '
    'an unknown consent type. Argument names are matched by name by PostgREST '
    '(backend/app/api/consent.py) — do not rename.';

-- ---------------------------------------------------------------------------
-- archive_expired_audit_logs
-- ---------------------------------------------------------------------------
--
-- `audit_logs` already carries `retention_until` (default now() + 7 years) from
-- 20260810000004. It needs a marker for "archived", and no code pins a name for
-- one, so a nullable timestamp is used: it records the flag and the moment in a
-- single column.
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Serves the scan below: only unarchived rows past retention are candidates.
CREATE INDEX IF NOT EXISTS idx_audit_logs_pending_archival
    ON public.audit_logs(retention_until)
    WHERE archived_at IS NULL;

-- Marks, never deletes. `RetentionService.archive_expired_audit_logs` documents
-- why: audit logs must survive for compliance, and actual deletion requires
-- manual approval after archival. Returns the number of rows marked, which the
-- caller reports verbatim as `archived_count`.
CREATE OR REPLACE FUNCTION public.archive_expired_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_archived integer;
BEGIN
    UPDATE public.audit_logs
       SET archived_at = now()
     WHERE retention_until IS NOT NULL
       AND retention_until < now()
       AND archived_at IS NULL;

    GET DIAGNOSTICS v_archived = ROW_COUNT;
    RETURN v_archived;
END;
$$;

-- Service role only: this is an administrative retention operation over a table
-- holding every user's prompt text and hashed IPs, and `audit_logs` itself is
-- unreadable by anon/authenticated by design.
REVOKE ALL ON FUNCTION public.archive_expired_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_expired_audit_logs() TO service_role;

COMMENT ON FUNCTION public.archive_expired_audit_logs() IS
    'Marks audit_logs rows past retention_until with archived_at and returns how '
    'many were marked. Never deletes: deletion requires manual approval after '
    'archival (backend/app/services/retention_service.py).';

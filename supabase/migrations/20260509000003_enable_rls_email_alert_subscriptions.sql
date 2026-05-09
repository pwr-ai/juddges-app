-- =============================================================================
-- Migration: Enable RLS on email_alert_subscriptions
-- =============================================================================
-- Purpose: Closes a security gap where public.email_alert_subscriptions was
-- exposed via PostgREST without row level security. The original migration
-- (20260406000001_digest_notifications.sql) enabled RLS on `notifications`
-- and `email_alert_logs` but missed this table.
--
-- The backend digest worker uses the service_role key (which bypasses RLS),
-- so enabling RLS here does not affect Celery dispatch logic.
-- =============================================================================

ALTER TABLE public.email_alert_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own email alerts"
    ON public.email_alert_subscriptions;
DROP POLICY IF EXISTS "Users can insert own email alerts"
    ON public.email_alert_subscriptions;
DROP POLICY IF EXISTS "Users can update own email alerts"
    ON public.email_alert_subscriptions;
DROP POLICY IF EXISTS "Users can delete own email alerts"
    ON public.email_alert_subscriptions;
DROP POLICY IF EXISTS "Service role full access on email_alert_subscriptions"
    ON public.email_alert_subscriptions;

CREATE POLICY "Users can read own email alerts"
    ON public.email_alert_subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email alerts"
    ON public.email_alert_subscriptions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email alerts"
    ON public.email_alert_subscriptions
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email alerts"
    ON public.email_alert_subscriptions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on email_alert_subscriptions"
    ON public.email_alert_subscriptions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_alert_subscriptions TO authenticated;
GRANT ALL ON public.email_alert_subscriptions TO service_role;

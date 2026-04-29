-- =============================================================================
-- Migration: Digest notification system
-- =============================================================================
-- Purpose: Support cron-driven email/webhook digest alerts for saved searches.
--
-- Tables created:
--   1. email_alert_subscriptions  – user-defined saved-search alert configs
--   2. notifications              – in-app notification inbox per user
--   3. email_alert_logs           – audit log of every digest dispatch attempt
--
-- All DDL is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so this
-- migration is safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. email_alert_subscriptions
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'email_alert_subscriptions'
    ) THEN
        CREATE TABLE public.email_alert_subscriptions (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            name          TEXT        NOT NULL,
            query         TEXT        NOT NULL,
            search_config JSONB       NOT NULL DEFAULT '{}',
            is_active     BOOLEAN     NOT NULL DEFAULT true,
            last_sent_at  TIMESTAMPTZ,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        COMMENT ON TABLE public.email_alert_subscriptions IS
            'User-defined saved-search subscriptions that drive periodic digest alerts. '
            'Each row represents one alert rule owned by a single user.';

        COMMENT ON COLUMN public.email_alert_subscriptions.search_config IS
            'Opaque JSONB blob forwarded verbatim to the search backend (filters, jurisdiction, etc.).';
        COMMENT ON COLUMN public.email_alert_subscriptions.last_sent_at IS
            'Timestamp of the most recent successful digest delivery for this subscription.';
    END IF;
END $$;

-- Index: fast lookup of all subscriptions belonging to a user
CREATE INDEX IF NOT EXISTS idx_email_alert_subs_user_id
    ON public.email_alert_subscriptions (user_id);

-- New columns added after initial table creation (ADD COLUMN IF NOT EXISTS is safe)
ALTER TABLE public.email_alert_subscriptions
    ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'weekly'
        CHECK (frequency IN ('daily', 'weekly'));

ALTER TABLE public.email_alert_subscriptions
    ADD COLUMN IF NOT EXISTS channels JSONB NOT NULL DEFAULT '["email"]';

ALTER TABLE public.email_alert_subscriptions
    ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN public.email_alert_subscriptions.frequency IS
    'Delivery cadence: ''daily'' or ''weekly''.';
COMMENT ON COLUMN public.email_alert_subscriptions.channels IS
    'Ordered list of delivery channels, e.g. ["email"] or ["email", "webhook"].';
COMMENT ON COLUMN public.email_alert_subscriptions.webhook_url IS
    'Optional webhook URL used when ''webhook'' is included in channels.';

-- Partial index: efficiently find active subscriptions to process for a given frequency
CREATE INDEX IF NOT EXISTS idx_email_alert_subs_active_freq
    ON public.email_alert_subscriptions (frequency)
    WHERE is_active = true;


-- =============================================================================
-- 2. notifications
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'notifications'
    ) THEN
        CREATE TABLE public.notifications (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            title      TEXT        NOT NULL,
            body       TEXT,
            link       TEXT,
            read       BOOLEAN     NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        COMMENT ON TABLE public.notifications IS
            'In-app notification inbox. Rows are inserted by the digest worker and '
            'consumed (marked read) by the frontend.';

        COMMENT ON COLUMN public.notifications.link IS
            'Optional deep-link URL surfaced in the notification UI (e.g. pre-filtered search).';
    END IF;
END $$;

-- Partial index: the inbox query only ever filters on unread rows
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, read)
    WHERE read = false;


-- =============================================================================
-- 3. email_alert_logs
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'email_alert_logs'
    ) THEN
        CREATE TABLE public.email_alert_logs (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            subscription_id     UUID        REFERENCES public.email_alert_subscriptions(id)
                                            ON DELETE SET NULL,
            frequency           TEXT,
            matches_count       INT         NOT NULL DEFAULT 0,
            channels_delivered  JSONB       NOT NULL DEFAULT '[]',
            error               TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        COMMENT ON TABLE public.email_alert_logs IS
            'Audit trail for every digest dispatch attempt. '
            'subscription_id is nullable (SET NULL) so logs survive subscription deletion.';

        COMMENT ON COLUMN public.email_alert_logs.matches_count IS
            'Number of new judgment matches found for the subscription at dispatch time.';
        COMMENT ON COLUMN public.email_alert_logs.channels_delivered IS
            'Channels that were successfully reached, e.g. ["email"].';
        COMMENT ON COLUMN public.email_alert_logs.error IS
            'Non-null when the dispatch failed; contains a human-readable error message.';
    END IF;
END $$;


-- =============================================================================
-- 4. Row Level Security
-- =============================================================================

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on notifications"
    ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ----------------------------------------------------------------------------
-- email_alert_logs
-- ----------------------------------------------------------------------------

ALTER TABLE public.email_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own alert logs" ON public.email_alert_logs;
DROP POLICY IF EXISTS "Service role full access on email_alert_logs" ON public.email_alert_logs;

-- Users may read logs for subscriptions they own by joining through the
-- email_alert_subscriptions table via a subquery.
CREATE POLICY "Users can read own alert logs"
    ON public.email_alert_logs
    FOR SELECT
    TO authenticated
    USING (
        subscription_id IN (
            SELECT id
            FROM public.email_alert_subscriptions
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on email_alert_logs"
    ON public.email_alert_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON public.email_alert_logs TO authenticated;
GRANT ALL ON public.email_alert_logs TO service_role;


-- =============================================================================
-- End of migration
-- =============================================================================

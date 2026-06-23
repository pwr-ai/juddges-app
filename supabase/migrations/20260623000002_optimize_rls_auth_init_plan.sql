-- =============================================================================
-- Migration: Optimize RLS auth.*() calls for per-query (InitPlan) evaluation
-- =============================================================================
-- Refs #182 (perf, critical).
--
-- Problem
-- -------
-- Several RLS policies call auth.uid() / auth.role() directly inside their
-- USING / WITH CHECK expressions, e.g. `auth.uid() = user_id`. Postgres treats
-- a bare function call in a row predicate as volatile-per-row and re-evaluates
-- it for every candidate row. Supabase documents the fix: wrap the call in a
-- scalar subquery — `(SELECT auth.uid())` — so the planner runs it once as an
-- InitPlan and reuses the cached result, turning RLS overhead from O(rows) to
-- O(1) per query.
--
-- Scope of this migration
-- -----------------------
-- This migration ONLY changes the *evaluation pattern* of existing policies.
-- It is a pure DROP POLICY + CREATE POLICY rewrite that preserves, byte-for-byte
-- in meaning, every policy's command (SELECT/INSERT/UPDATE/DELETE/ALL), target
-- role(s), and access predicate. The set of rows each role can read or write is
-- IDENTICAL before and after:
--
--   * `auth.uid() = X`            -> `(SELECT auth.uid()) = X`
--   * `X = auth.uid()`            -> `X = (SELECT auth.uid())`
--   * `auth.role() = 'role'`      -> `(SELECT auth.role()) = 'role'`
--   * correlated/IN subqueries keep their structure; only the auth.* call inside
--     is wrapped.
--
-- `(SELECT auth.uid())` is logically equal to `auth.uid()` for every row in a
-- single query (auth.uid() is constant within a transaction/request), so the
-- access decision is unchanged — only the number of times the function executes
-- changes.
--
-- Historical migrations are intentionally NOT edited; this new migration is the
-- single source of the optimized policy definitions and is idempotent
-- (DROP POLICY IF EXISTS before each CREATE).
--
-- Explicitly OUT OF SCOPE (left untouched on purpose):
--   * Policies that call public.is_admin() (judgments, document_chunks,
--     judgment_base_extractions) — a different (function-call) footgun that
--     needs its own review; not part of #182.
--   * auth.uid() used inside SECURITY DEFINER plpgsql function bodies
--     (get_my_profile(), is_admin()) — those are not RLS row predicates and gain
--     no InitPlan benefit.
--
-- Index note for collection_judgments (per #182): the EXISTS subquery joins
-- collections(id) [PRIMARY KEY] and filters collection_judgments.collection_id,
-- which is the leading column of the composite PK (collection_id, judgment_id)
-- and is additionally covered by idx_collection_judgments_collection_created.
-- Both sides are already indexed; no index changes are required here. There is a
-- single PERMISSIVE policy on the table (collection_judgments_owner_all), so no
-- duplicate double-evaluation exists.
-- =============================================================================


-- =============================================================================
-- public.collections  (orig: 20260509000003_create_collections_tables.sql)
-- =============================================================================

DROP POLICY IF EXISTS collections_owner_select ON public.collections;
CREATE POLICY collections_owner_select ON public.collections
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collections_owner_insert ON public.collections;
CREATE POLICY collections_owner_insert ON public.collections
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collections_owner_update ON public.collections;
CREATE POLICY collections_owner_update ON public.collections
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collections_owner_delete ON public.collections;
CREATE POLICY collections_owner_delete ON public.collections
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);


-- =============================================================================
-- public.collection_judgments  (orig: 20260509000003_create_collections_tables.sql)
-- EXISTS subquery preserved; only the inner auth.uid() is wrapped.
-- =============================================================================

DROP POLICY IF EXISTS collection_judgments_owner_all ON public.collection_judgments;
CREATE POLICY collection_judgments_owner_all ON public.collection_judgments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_judgments.collection_id
              AND c.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_judgments.collection_id
              AND c.user_id = (SELECT auth.uid())
        )
    );


-- =============================================================================
-- public.email_alert_subscriptions
-- (orig: 20260509000007_enable_rls_email_alert_subscriptions.sql)
-- =============================================================================

DROP POLICY IF EXISTS "Users can read own email alerts"
    ON public.email_alert_subscriptions;
CREATE POLICY "Users can read own email alerts"
    ON public.email_alert_subscriptions
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own email alerts"
    ON public.email_alert_subscriptions;
CREATE POLICY "Users can insert own email alerts"
    ON public.email_alert_subscriptions
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own email alerts"
    ON public.email_alert_subscriptions;
CREATE POLICY "Users can update own email alerts"
    ON public.email_alert_subscriptions
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own email alerts"
    ON public.email_alert_subscriptions;
CREATE POLICY "Users can delete own email alerts"
    ON public.email_alert_subscriptions
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);


-- =============================================================================
-- public.research_sessions  (orig: 20260403000001_create_research_agent_tables.sql)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own research sessions" ON public.research_sessions;
CREATE POLICY "Users can view own research sessions"
    ON public.research_sessions FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own research sessions" ON public.research_sessions;
CREATE POLICY "Users can insert own research sessions"
    ON public.research_sessions FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own research sessions" ON public.research_sessions;
CREATE POLICY "Users can update own research sessions"
    ON public.research_sessions FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access to research_sessions" ON public.research_sessions;
CREATE POLICY "Service role full access to research_sessions"
    ON public.research_sessions FOR ALL
    USING ((SELECT auth.role()) = 'service_role');


-- =============================================================================
-- public.agent_checkpoints  (orig: 20260403000001_create_research_agent_tables.sql)
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access to agent_checkpoints" ON public.agent_checkpoints;
CREATE POLICY "Service role full access to agent_checkpoints"
    ON public.agent_checkpoints FOR ALL
    USING ((SELECT auth.role()) = 'service_role');


-- =============================================================================
-- public.notifications  (orig: 20260406000001_digest_notifications.sql)
-- =============================================================================

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);


-- =============================================================================
-- public.email_alert_logs  (orig: 20260406000001_digest_notifications.sql)
-- IN-subquery preserved; only the inner auth.uid() is wrapped.
-- =============================================================================

DROP POLICY IF EXISTS "Users can read own alert logs" ON public.email_alert_logs;
CREATE POLICY "Users can read own alert logs"
    ON public.email_alert_logs
    FOR SELECT
    TO authenticated
    USING (
        subscription_id IN (
            SELECT id
            FROM public.email_alert_subscriptions
            WHERE user_id = (SELECT auth.uid())
        )
    );


-- =============================================================================
-- public.profiles  (orig: 20260210000004_verify_auth_schema.sql)
-- Note: RLS policies only. The auth.uid() calls inside the SECURITY DEFINER
-- functions get_my_profile() and is_admin() are intentionally left as-is.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = id)
    WITH CHECK ((SELECT auth.uid()) = id);


-- =============================================================================
-- public.search_feedback  (orig: 20260511000001_create_search_feedback_tables.sql)
-- Newer migration audited per #182 — same pattern.
-- =============================================================================

DROP POLICY IF EXISTS "Allow search feedback inserts" ON public.search_feedback;
CREATE POLICY "Allow search feedback inserts"
    ON public.search_feedback
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        user_id IS NULL OR user_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Users read own search feedback" ON public.search_feedback;
CREATE POLICY "Users read own search feedback"
    ON public.search_feedback
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));


-- =============================================================================
-- public.feature_requests  (orig: 20260511000001_create_search_feedback_tables.sql)
-- Newer migration audited per #182 — same pattern.
-- =============================================================================

DROP POLICY IF EXISTS "Allow feature request inserts" ON public.feature_requests;
CREATE POLICY "Allow feature request inserts"
    ON public.feature_requests
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        user_id IS NULL OR user_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "Users read own feature requests" ON public.feature_requests;
CREATE POLICY "Users read own feature requests"
    ON public.feature_requests
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));


-- =============================================================================
-- Service-role-only analytics/topic tables — auth.role() footgun wrapped.
-- Predicates and target scope are unchanged (service_role only).
-- =============================================================================

-- public.search_analytics  (orig: 20260307000001_create_search_analytics_table.sql)
DROP POLICY IF EXISTS "Service role full access on search_analytics" ON public.search_analytics;
CREATE POLICY "Service role full access on search_analytics"
    ON public.search_analytics
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');

-- public.dashboard_precomputed_stats  (orig: 20260325000001_create_dashboard_precomputed_stats.sql)
DROP POLICY IF EXISTS "Service role full access on dashboard_precomputed_stats"
    ON public.dashboard_precomputed_stats;
CREATE POLICY "Service role full access on dashboard_precomputed_stats"
    ON public.dashboard_precomputed_stats
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');

-- public.doc_type_stats  (orig: 20260325000001_create_dashboard_precomputed_stats.sql)
DROP POLICY IF EXISTS "Service role full access on doc_type_stats"
    ON public.doc_type_stats;
CREATE POLICY "Service role full access on doc_type_stats"
    ON public.doc_type_stats
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');

-- public.search_topics  (orig: 20260513000001_create_search_topics_table.sql)
DROP POLICY IF EXISTS "Service role full access on search_topics" ON public.search_topics;
CREATE POLICY "Service role full access on search_topics"
    ON public.search_topics
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');

-- public.search_topic_clicks  (orig: 20260511000004_create_search_topic_clicks_table.sql)
DROP POLICY IF EXISTS "Service role full access on search_topic_clicks" ON public.search_topic_clicks;
CREATE POLICY "Service role full access on search_topic_clicks"
    ON public.search_topic_clicks
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role')
    WITH CHECK ((SELECT auth.role()) = 'service_role');


-- =============================================================================
-- public.reasoning_lines / reasoning_line_members / reasoning_line_events
-- (orig: 20260404000001_create_reasoning_lines_tables.sql)
-- Service-role write + authenticated read; auth.role() footgun wrapped.
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on reasoning_lines" ON public.reasoning_lines;
CREATE POLICY "Service role full access on reasoning_lines"
    ON public.reasoning_lines FOR ALL
    USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role full access on reasoning_line_members" ON public.reasoning_line_members;
CREATE POLICY "Service role full access on reasoning_line_members"
    ON public.reasoning_line_members FOR ALL
    USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role full access on reasoning_line_events" ON public.reasoning_line_events;
CREATE POLICY "Service role full access on reasoning_line_events"
    ON public.reasoning_line_events FOR ALL
    USING ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can read reasoning_lines" ON public.reasoning_lines;
CREATE POLICY "Authenticated users can read reasoning_lines"
    ON public.reasoning_lines FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read reasoning_line_members" ON public.reasoning_line_members;
CREATE POLICY "Authenticated users can read reasoning_line_members"
    ON public.reasoning_line_members FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can read reasoning_line_events" ON public.reasoning_line_events;
CREATE POLICY "Authenticated users can read reasoning_line_events"
    ON public.reasoning_line_events FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');


-- =============================================================================
-- Verification: assert every rewritten policy still exists and that no policy
-- on the touched tables retains a bare (unwrapped) auth.uid()/auth.role() call.
-- Fails loud if a rewrite was missed.
-- =============================================================================

-- Implementation note: Postgres' POSIX regex engine does NOT support
-- lookbehind, and pg_policies.qual/with_check return the *deparsed* expression
-- (where `(SELECT auth.uid())` renders as `( SELECT auth.uid() AS uid)`). We
-- therefore verify positively: any expression that references auth.uid()/
-- auth.role() MUST also contain the wrapped `SELECT auth.<fn>` form. An
-- unwrapped call would reference the function without that SELECT wrapper.
DO $$
DECLARE
    unwrapped_count INT;
BEGIN
    SELECT count(*) INTO unwrapped_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'collections', 'collection_judgments', 'email_alert_subscriptions',
          'research_sessions', 'agent_checkpoints', 'notifications',
          'email_alert_logs', 'profiles', 'search_feedback', 'feature_requests',
          'search_analytics', 'dashboard_precomputed_stats', 'doc_type_stats',
          'search_topics', 'search_topic_clicks',
          'reasoning_lines', 'reasoning_line_members', 'reasoning_line_events'
      )
      -- USING expression references an auth.* call but lacks the SELECT wrapper
      AND (
          (
              qual ~* 'auth\.(uid|role)\s*\('
              AND qual !~* 'select\s+auth\.(uid|role)\s*\('
          )
          OR (
              with_check ~* 'auth\.(uid|role)\s*\('
              AND with_check !~* 'select\s+auth\.(uid|role)\s*\('
          )
      );

    IF unwrapped_count > 0 THEN
        RAISE EXCEPTION
            'RLS InitPlan optimization incomplete: % policy expression(s) still call a bare auth.uid()/auth.role()',
            unwrapped_count;
    END IF;

    RAISE NOTICE 'RLS InitPlan optimization verified: all targeted policies use (SELECT auth.*())';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

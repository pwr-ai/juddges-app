-- =============================================================================
-- Migration: Lock down SECURITY DEFINER analytics RPCs and re-pin search_path
-- =============================================================================
-- Issue #96 (security: review and fix Supabase DB access and permissions).
--
-- Background / findings from the access-control audit
-- ---------------------------------------------------
-- The RLS posture across user-facing tables is sound: every table in `public`
-- has RLS enabled with owner- or admin-scoped policies, and write access to
-- `judgments` / `document_chunks` is admin-or-service-role only. The gaps this
-- migration closes are in SECURITY DEFINER *functions*, not tables:
--
--   1. PUBLIC EXECUTE on SECURITY DEFINER analytics RPCs (HIGH)
--      `get_user_search_history(uuid,int,int)`, `get_popular_search_queries(int,int)`
--      and `get_zero_result_queries(int,int)` were created without an explicit
--      grant. PostgreSQL grants EXECUTE to PUBLIC by default, so anon and
--      authenticated roles can call them directly through PostgREST
--      (`/rest/v1/rpc/...`) using the public anon key.
--
--      `get_user_search_history` is the worst case: it is SECURITY DEFINER and
--      filters only by its `p_user_id` argument, performing no `auth.uid()`
--      check. Any caller can therefore read ANY user's search history
--      (an IDOR / horizontal-privilege bug) by passing an arbitrary UUID.
--      These RPCs are only ever invoked by the backend with the service-role
--      client (see backend/app/services/search_analytics.py), so PUBLIC /
--      anon / authenticated EXECUTE is removed and EXECUTE is restricted to
--      service_role.
--
--   2. `update_judgment_embedding` is callable by `authenticated` (MEDIUM)
--      It is SECURITY DEFINER and writes directly into `public.judgments`,
--      whose own write policies are admin/service-role only. The grant to
--      `authenticated` lets any signed-in non-admin overwrite the embedding of
--      any judgment, bypassing the table policies. EXECUTE is restricted to
--      service_role (the only legitimate caller — the ingestion / re-embedding
--      pipeline).
--
--   3. Mutable search_path on SECURITY DEFINER functions (MEDIUM)
--      `SET search_path = ''` hardening was added to several functions in
--      20260305000001, but `update_judgment_embedding` was later re-created in
--      20260322000001 with CREATE OR REPLACE, which resets function attributes
--      and silently dropped the hardening. The analytics RPCs and
--      `refresh_dashboard_stats` never had it. A mutable search_path on a
--      SECURITY DEFINER function is an escalation vector (Supabase linter:
--      `function_search_path_mutable`) and is pinned to a fixed value here.
--
-- Scope note: this migration deliberately does NOT change any per-row RLS
-- evaluation pattern (`auth.uid()` wrapping etc.) — that performance rewrite is
-- tracked separately in #182. This is access-control correctness only.
--
-- Rollback: re-grant EXECUTE to the previous roles and `RESET` search_path on
-- the affected functions. No data is modified.
-- =============================================================================


-- =============================================================================
-- 1. Restrict EXECUTE on backend-only SECURITY DEFINER analytics RPCs
-- =============================================================================
-- Revoke the implicit PUBLIC grant (covers anon + authenticated) and grant
-- EXECUTE to service_role only. The backend always calls these with the
-- service-role client, so no application path regresses.

REVOKE ALL ON FUNCTION public.get_user_search_history(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_search_history(uuid, int, int) TO service_role;

REVOKE ALL ON FUNCTION public.get_popular_search_queries(int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_popular_search_queries(int, int) TO service_role;

REVOKE ALL ON FUNCTION public.get_zero_result_queries(int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_zero_result_queries(int, int) TO service_role;


-- =============================================================================
-- 2. Restrict EXECUTE on update_judgment_embedding to service_role only
-- =============================================================================
-- Previously granted to `service_role, authenticated`. Writing judgment
-- embeddings is a privileged ingestion-pipeline operation; authenticated
-- end users must not be able to invoke it.

REVOKE ALL ON FUNCTION public.update_judgment_embedding(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_judgment_embedding(uuid, text) TO service_role;


-- =============================================================================
-- 3. Pin search_path on the affected SECURITY DEFINER functions
-- =============================================================================
-- A fixed search_path removes the mutable-path escalation vector. The analytics
-- functions reference `search_analytics` unqualified, so they are pinned to
-- `public, pg_temp` (a fixed, non-mutable path that keeps the body resolving).
-- `update_judgment_embedding` and `refresh_dashboard_stats` already schema-
-- qualify every object they touch, but are pinned to the same fixed path for
-- consistency and to satisfy the linter.

ALTER FUNCTION public.get_user_search_history(uuid, int, int)  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_popular_search_queries(int, int)     SET search_path = public, pg_temp;
ALTER FUNCTION public.get_zero_result_queries(int, int)        SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_dashboard_stats()                SET search_path = public, pg_temp;


-- update_judgment_embedding: the 20260322000001 re-definition uses an
-- unqualified `::vector(1024)` cast, so an empty search_path would fail to
-- resolve the type. Pin to `public, pg_temp` instead (the `vector` type lives
-- in `public` in this project — see public.vector(768) usage in 20260305000001).
ALTER FUNCTION public.update_judgment_embedding(uuid, text) SET search_path = public, pg_temp;


-- =============================================================================
-- 4. Verification — fail loud if anon/authenticated retain EXECUTE on the
--    locked-down RPCs.
-- =============================================================================

DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    INTO leaked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'get_user_search_history',
          'get_popular_search_queries',
          'get_zero_result_queries',
          'update_judgment_embedding'
      )
      AND (
          has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon/authenticated still have EXECUTE on: %', leaked;
    END IF;

    RAISE NOTICE 'Security-definer RPC lockdown verified: anon/authenticated have no EXECUTE on the audited functions';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

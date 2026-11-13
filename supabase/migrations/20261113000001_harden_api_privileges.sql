-- Close privilege-escalation and IDOR paths left open by Supabase's default
-- grants. These operations are called by the backend with service_role, except
-- rollback_to_version which is also called directly by an authenticated user.

-- A profile owner may edit presentation/preferences fields only. In particular,
-- role must never be writable through the browser's authenticated role.
SET lock_timeout = '5s';

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, organization, department, preferences, metadata)
    ON public.profiles TO authenticated;

-- The default EXECUTE grant on newly-created public functions is a recurring
-- source of SECURITY DEFINER exposure. New functions must grant callers
-- explicitly; existing functions are hardened below as well.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

-- Private/admin RPCs: the API server uses the service-role client. Revoking
-- PUBLIC is required in addition to revoking anon/authenticated because PUBLIC
-- is a separate ACL entry in PostgreSQL.
REVOKE ALL ON FUNCTION public.update_user_consent(uuid, text, boolean, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_consent(uuid, text, boolean, text)
    TO service_role;

REVOKE ALL ON FUNCTION public.create_document_version(
    text, text, text, text, text, text, text, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_version(
    text, text, text, text, text, text, text, text, jsonb, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.archive_expired_audit_logs()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_audit_logs() TO service_role;

REVOKE ALL ON FUNCTION public.get_user_topic_clicks(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_topic_clicks(uuid, integer, integer)
    TO service_role;

REVOKE ALL ON FUNCTION public.get_trending_topics(integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_topics(integer, integer)
    TO service_role;

-- Preserve the existing implementation under a private name before replacing
-- the public entry point with a fail-closed authorization wrapper.
DO $$
BEGIN
    IF to_regprocedure('public._rollback_to_version_impl(uuid,integer)') IS NULL THEN
        EXECUTE 'ALTER FUNCTION public.rollback_to_version(uuid, integer) RENAME TO _rollback_to_version_impl';
    END IF;
END
$$;

-- Rollback remains a user-facing operation, but only for the owning user (or
-- the backend service role). The wrapper makes NULL auth.uid() fail closed
-- instead of treating an anonymous call as trusted.
CREATE OR REPLACE FUNCTION public.rollback_to_version(
    p_schema_id uuid,
    p_version_number integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor uuid := (SELECT auth.uid());
    v_owner uuid;
    v_owner_found boolean;
BEGIN
    SELECT s.user_id, true INTO v_owner, v_owner_found
      FROM public.extraction_schemas s
     WHERE s.id = p_schema_id;

    IF NOT COALESCE(v_owner_found, false) THEN
        RAISE EXCEPTION 'schema % not found', p_schema_id USING ERRCODE = 'no_data_found';
    END IF;

    IF COALESCE((SELECT auth.role()), '') <> 'service_role'
       AND (v_actor IS NULL OR v_owner IS NULL OR v_owner <> v_actor) THEN
        RAISE EXCEPTION 'permission denied to roll back schema %', p_schema_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Delegate the complete, already-hardened implementation to the internal
    -- helper. SECURITY DEFINER functions cannot safely call themselves, so the
    -- implementation is installed under a private name below.
    RETURN public._rollback_to_version_impl(p_schema_id, p_version_number);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_to_version(uuid, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_to_version(uuid, integer)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._rollback_to_version_impl(uuid, integer)
    FROM PUBLIC, anon, authenticated;

-- These analytics functions run with owner privileges. Pin their search path
-- and qualify the table to prevent search_path shadowing.
CREATE OR REPLACE FUNCTION public.get_trending_topics(
    days_back integer DEFAULT 30,
    max_results integer DEFAULT 20
)
RETURNS TABLE(topic_id text, click_count bigint, pl_count bigint, uk_count bigint,
              other_count bigint, last_clicked timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT stc.topic_id, count(*),
           count(*) FILTER (WHERE upper(stc.jurisdiction) = 'PL'),
           count(*) FILTER (WHERE upper(stc.jurisdiction) = 'UK'),
           count(*) FILTER (WHERE stc.jurisdiction IS NULL
                                  OR upper(stc.jurisdiction) NOT IN ('PL', 'UK')),
           max(stc.created_at)
      FROM public.search_topic_clicks stc
     WHERE stc.created_at >= pg_catalog.now() - (days_back || ' days')::interval
     GROUP BY stc.topic_id
     ORDER BY count(*) DESC, max(stc.created_at) DESC
     LIMIT max_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_topic_clicks(
    p_user_id uuid,
    days_back integer DEFAULT 30,
    max_results integer DEFAULT 50
)
RETURNS TABLE(topic_id text, click_count bigint, last_clicked timestamptz,
              last_query text, jurisdiction text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT stc.topic_id, count(*), max(stc.created_at),
           (array_agg(stc.query ORDER BY stc.created_at DESC))[1],
           (array_agg(stc.jurisdiction ORDER BY stc.created_at DESC))[1]
      FROM public.search_topic_clicks stc
     WHERE stc.user_id = p_user_id
       AND stc.created_at >= pg_catalog.now() - (days_back || ' days')::interval
     GROUP BY stc.topic_id
     ORDER BY max(stc.created_at) DESC
     LIMIT max_results;
END;
$$;

-- Checkpoints and model-response caches are backend infrastructure, not Data
-- API resources. Move the existing tables (and their data/indexes) rather than
-- recreating them. Deploy together with the backend's private search_path;
-- stop backend writers during the move so old code cannot recreate public tables.
SET lock_timeout = '5s';

-- The rollback implementation inherited service_role's old grant when it was
-- renamed. Only the authorized wrapper needs to call it, as its owner.
REVOKE ALL ON FUNCTION public._rollback_to_version_impl(uuid, integer)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS juddges_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA juddges_private FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'checkpoint_migrations', 'checkpoints', 'checkpoint_blobs',
        'checkpoint_writes', 'full_llm_cache', 'full_md5_llm_cache'
    ] LOOP
        IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            -- Fail on a name collision instead of silently abandoning data in
            -- one of two copies. Normal re-application has no public copy.
            EXECUTE format('ALTER TABLE public.%I SET SCHEMA juddges_private', table_name);
        END IF;
        IF to_regclass(format('juddges_private.%I', table_name)) IS NULL THEN
            RAISE EXCEPTION 'Missing runtime table: %', table_name;
        END IF;
        EXECUTE format('ALTER TABLE juddges_private.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'REVOKE ALL ON TABLE juddges_private.%I FROM PUBLIC, anon, authenticated, service_role',
            table_name
        );
    END LOOP;
END;
$$;

-- No implicit API access to future library-managed objects in this schema.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA juddges_private
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA juddges_private
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

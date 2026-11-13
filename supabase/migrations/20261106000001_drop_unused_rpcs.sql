-- =============================================================================
-- Drop three RPCs that nothing calls
-- =============================================================================
-- Part of the prune plan (wave 2), item 15 (Batch A16).
--
--   * search_judgments_by_text(text, text, int)
--       Title/summary full-text RPC. Search goes through
--       search_judgments_hybrid and Meilisearch; 20260623000003 already noted
--       "This RPC currently has no application callers."
--   * get_judgment_full_text(uuid)
--       Detail RPC added beside the above in 20260623000003. The app reads
--       full_text from the judgments table directly.
--   * get_base_schema_umap_points(double precision x4, int)
--       Viewport UMAP RPC from 20260226000001. The UMAP coordinates are read
--       with a plain select on judgments (backend/app/judgments_pkg).
--
-- No backend, juddges_search / juddges_mcp package, frontend, script, test,
-- view or other SQL function references any of the three (checked with
-- `git grep` at the time of writing). PL/pgSQL bodies are not tracked by
-- pg_depend, so that grep is the dependency check.
--
-- Deliberately NOT dropped:
--   * schema_field_snapshot_diff(jsonb, jsonb): called from
--     tg_extraction_schemas_create_version() (the extraction_schemas trigger)
--     and rollback_to_version() in 20260810000005. Dropping it would break
--     every schema save.
--   * search_judgments_by_embedding: live, and being changed separately.
--
-- Before applying in production, confirm the three are idle:
--   SELECT funcname, calls FROM pg_stat_user_functions
--   WHERE schemaname = 'public'
--     AND funcname IN ('search_judgments_by_text', 'get_judgment_full_text',
--                      'get_base_schema_umap_points');
-- Counters exist only when track_functions is on: 'pl' counts the PL/pgSQL
-- search_judgments_by_text, and only 'all' counts the two LANGUAGE sql
-- functions, and an inlined SQL function is never counted at all. A missing row
-- therefore means "not tracked", not "never called"; fall back to PostgREST /
-- Supabase API logs for /rest/v1/rpc/<name> in that case.
--
-- Rollback: re-run the CREATE FUNCTION / GRANT blocks for these functions from
-- 20260623000003_search_perf_ef_search_facets_fulltext.sql (section 3) and
-- 20260226000001_create_judgment_base_extractions_table.sql. No data is
-- modified.
-- =============================================================================

DROP FUNCTION IF EXISTS public.search_judgments_by_text(text, text, int);

DROP FUNCTION IF EXISTS public.get_judgment_full_text(uuid);

DROP FUNCTION IF EXISTS public.get_base_schema_umap_points(
    double precision, double precision, double precision, double precision, int
);

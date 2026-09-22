-- =============================================================================
-- Migration: bring the LangChain LLM cache tables under RLS
-- =============================================================================
-- `full_llm_cache` and `full_md5_llm_cache` are not app schema: SQLAlchemy
-- creates them at boot from `SQLAlchemyMd5Cache(engine)` in
-- backend/app/langchain_cache.py, against DATABASE_URL — which is the same
-- Supabase project. They therefore never passed through this directory, and
-- they landed in `public` with RLS off and Supabase's default
-- `GRANT ALL ... TO anon, authenticated` intact. PostgREST exposes the whole
-- `public` schema, so the cache was part of the API surface: readable by any
-- client, and writable — and a row written by a client is a model response the
-- backend would later serve as its own. Nothing client-side has any business
-- touching derived cache data.
--
-- The CREATE TABLE statements are deliberate, not redundant: SQLAlchemy's
-- `create_all(checkfirst=True)` skips DDL for a table that already exists, so
-- pre-creating them here is what makes a fresh database (and the
-- `Database Contract` CI run) come up protected instead of letting the app
-- recreate them wide open. The DDL below mirrors what the live tables have.
--
-- The backend connects as `postgres`, which owns both tables, and
-- `relforcerowsecurity` stays off — owners bypass RLS, so caching keeps
-- working with no code change.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.full_llm_cache (
    prompt   VARCHAR NOT NULL,
    llm      VARCHAR NOT NULL,
    idx      INTEGER NOT NULL,
    response VARCHAR,
    PRIMARY KEY (prompt, llm, idx)
);

CREATE TABLE IF NOT EXISTS public.full_md5_llm_cache (
    id         VARCHAR NOT NULL PRIMARY KEY,
    prompt_md5 VARCHAR,
    llm        VARCHAR,
    idx        INTEGER,
    prompt     VARCHAR,
    response   VARCHAR
);

CREATE INDEX IF NOT EXISTS ix_full_md5_llm_cache_idx
    ON public.full_md5_llm_cache (idx);
CREATE INDEX IF NOT EXISTS ix_full_md5_llm_cache_llm
    ON public.full_md5_llm_cache (llm);
CREATE INDEX IF NOT EXISTS ix_full_md5_llm_cache_prompt_md5
    ON public.full_md5_llm_cache (prompt_md5);

-- No policies: the cache has no client-side reader or writer. RLS with zero
-- policies denies every PostgREST role, which is exactly the intent, and is
-- the only thing that clears Supabase's `rls_disabled_in_public` lint.
ALTER TABLE public.full_llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.full_md5_llm_cache ENABLE ROW LEVEL SECURITY;

-- Second layer, per the pattern in 20260817000001: the default privileges
-- Supabase applies mean a table is writable by anon the moment it exists, and
-- an RLS denial is silent. Revoking turns a client write into an error and
-- means adding a policy later cannot open writes on its own.
REVOKE ALL ON public.full_llm_cache FROM anon, authenticated;
REVOKE ALL ON public.full_md5_llm_cache FROM anon, authenticated;
GRANT ALL ON public.full_llm_cache TO service_role;
GRANT ALL ON public.full_md5_llm_cache TO service_role;

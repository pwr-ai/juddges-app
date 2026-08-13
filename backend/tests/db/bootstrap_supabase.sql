-- Everything a bare Postgres lacks that the migrations and their RLS policies
-- assume Supabase provides. Applied before the migration chain.
--
-- This file is not cosmetic. Each block below exists because omitting it makes
-- an assertion pass for the wrong reason:
--
--   * without `auth.uid()`, every owner-scoped policy evaluates against NULL and
--     denies everything, so an isolation test passes even if the policy is wrong
--   * without the roles, `SET LOCAL ROLE authenticated` errors and the test is
--     never actually run as a non-superuser
--   * without `ALTER DEFAULT PRIVILEGES`, tables come out with no privileges for
--     anon/authenticated, so a table those roles can really reach in production
--     looks locked down here
--   * without BYPASSRLS on service_role, the "the backend can still read it"
--     half of each policy test cannot be expressed

CREATE SCHEMA IF NOT EXISTS auth;

-- Migrations reference auth.users(id) as the owner foreign key, and the
-- app_events auth triggers read these columns off NEW/OLD. The real
-- auth.users has many more; only what the migrations touch is needed, and a
-- missing one fails the chain rather than passing quietly — which is how this
-- list was derived (`grep -oE '(OLD|NEW)\.[a-z_]+' supabase/migrations/*`).
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY,
    email TEXT,
    last_sign_in_at TIMESTAMPTZ,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END $$;

-- The backend uses the service role and expects to see every row.
ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Supabase resolves these from the request JWT. Reading a session GUC lets a
-- test impersonate a user with `SET LOCAL request.jwt.claim.sub = '<uuid>'`.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;

-- One migration adds a table to this publication behind an exception guard.
-- Creating it here exercises the real path rather than the guard.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- pgvector and pg_trgm are enabled on the real project; `judgments` and
-- `document_chunks` declare vector(1024) columns.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- THE SUBTLE ONE. Supabase ships this default, so every newly created table
-- grants ALL to anon and authenticated before any policy is considered. A bare
-- Postgres does not, which silently turns "RLS denies this" into "the role had
-- no privilege anyway" — a false pass. Reproduce it so the tests measure
-- policies rather than missing grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

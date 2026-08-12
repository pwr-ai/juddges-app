-- Creates three tables that back features already reachable in the app but
-- which never had a migration: `saved_searches` (the /saved-searches page and
-- SaveSearchDialog), `document_versions` (the version-history panel rendered on
-- every document page) and `audit_logs` (the /admin recent-activity panel plus
-- the compliance audit trail).
--
-- Every column below is derived from the code that reads or writes it; the
-- reference is given inline. Nothing here changes application code.

-- =========================================================================
-- saved_searches
-- Read/written by the user-scoped Supabase client in
-- frontend/app/api/saved-searches/route.ts (GET :32-40, POST :90-105,
-- PATCH :169-187, DELETE :231-235). Row shape consumed by
-- frontend/types/saved-search.ts and frontend/app/saved-searches/page.tsx.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.saved_searches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- route.ts:93 inserts the Supabase auth user id; owner-scoped like collections.
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- route.ts:82-88 rejects empty names and names longer than 200 chars.
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description     TEXT,                                   -- route.ts:95
    folder          TEXT,                                   -- route.ts:96, filtered at route.ts:39
    query           TEXT NOT NULL DEFAULT '',               -- route.ts:97 (`searchQuery || ''`)
    search_config   JSONB NOT NULL DEFAULT '{}'::jsonb,     -- route.ts:98, shape = SavedSearchConfig
    document_types  TEXT[] NOT NULL DEFAULT '{}'::text[],   -- route.ts:99
    languages       TEXT[] NOT NULL DEFAULT '{}'::text[],   -- route.ts:100
    -- route.ts:101 defaults to 'thinking'; the only values the UI can produce are
    -- searchStore.searchType = 'rabbit' | 'thinking' (frontend/lib/store/searchStore.ts:57).
    search_mode     TEXT NOT NULL DEFAULT 'thinking'
                    CHECK (search_mode IN ('rabbit', 'thinking')),
    is_shared       BOOLEAN NOT NULL DEFAULT false,         -- route.ts:102, read at route.ts:35
    -- Not written by any code path today; declared non-optional by
    -- frontend/types/saved-search.ts:12 and returned by the `select("*")` at route.ts:34.
    shared_with     TEXT[] NOT NULL DEFAULT '{}'::text[],
    last_used_at    TIMESTAMPTZ,                            -- route.ts:170
    use_count       INTEGER NOT NULL DEFAULT 0,             -- route.ts:174-178
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()      -- ordering key at route.ts:36
);

-- route.ts:35 filters on user_id, route.ts:36 orders by updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
    ON public.saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_updated
    ON public.saved_searches(user_id, updated_at DESC);
-- route.ts:39 `.eq("folder", folder)`.
CREATE INDEX IF NOT EXISTS idx_saved_searches_folder
    ON public.saved_searches(folder) WHERE folder IS NOT NULL;
-- route.ts:35 `is_shared.eq.true` branch of the OR filter.
CREATE INDEX IF NOT EXISTS idx_saved_searches_is_shared
    ON public.saved_searches(updated_at DESC) WHERE is_shared;

CREATE OR REPLACE FUNCTION public.tg_saved_searches_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_searches_set_updated_at ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_set_updated_at
    BEFORE UPDATE ON public.saved_searches
    FOR EACH ROW EXECUTE FUNCTION public.tg_saved_searches_set_updated_at();

-- RLS: this table is reached with the *user's* JWT (frontend/lib/supabase/server
-- createClient), so the policies below are the real access control. Writes are
-- strictly owner-scoped. The SELECT predicate also admits `is_shared` rows,
-- because route.ts:35 asks for `user_id.eq.<uid>,is_shared.eq.true` — an
-- owner-only predicate would silently drop the shared half of that filter.
-- `is_shared` is opt-in via SaveSearchDialog, so publishing it is deliberate.
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_searches_read ON public.saved_searches;
CREATE POLICY saved_searches_read ON public.saved_searches
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_shared);

DROP POLICY IF EXISTS saved_searches_owner_insert ON public.saved_searches;
CREATE POLICY saved_searches_owner_insert ON public.saved_searches
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_searches_owner_update ON public.saved_searches;
CREATE POLICY saved_searches_owner_update ON public.saved_searches
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS saved_searches_owner_delete ON public.saved_searches;
CREATE POLICY saved_searches_owner_delete ON public.saved_searches
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;

COMMENT ON TABLE public.saved_searches IS
    'User-owned saved searches backing /saved-searches and SaveSearchDialog. Owner-scoped via RLS; is_shared rows are additionally readable by any authenticated user.';

-- =========================================================================
-- document_versions
-- Written and read exclusively by backend/app/versioning.py under the service
-- role (get_vector_db -> service-role Supabase client). The UI shape it must
-- satisfy is frontend/types/versioning.ts.
--
-- `document_id` is TEXT, not a UUID FK to judgments(id): callers pass whatever
-- the /documents/[id] route segment contains, which is validated only as
-- `^[a-zA-Z0-9_.-]{1,255}$` (frontend/lib/documents/server-metadata.ts:8) and is
-- resolved downstream as *either* `judgments.id` (uuid) *or* `judgments.source_id`
-- (text) — see documents_db.get_document_by_id (`column = "id" if _UUID_RE.match(...)
-- else "source_id"`). versioning.py additionally matches it against
-- `legal_documents.document_id`. A uuid FK would reject every source-formatted id,
-- so this mirrors the TEXT `collection_judgments.judgment_id` convention.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.document_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- versioning.py:221
    document_id         TEXT NOT NULL,                                      -- versioning.py:213 (.eq), :480 (insert)
    version_number      INTEGER NOT NULL CHECK (version_number >= 1),        -- versioning.py:481; ge=1 at :98
    title               TEXT,                                               -- versioning.py:482
    full_text           TEXT NOT NULL,                                      -- versioning.py:483, read non-null at :298
    summary             TEXT,                                               -- versioning.py:484
    content_hash        TEXT NOT NULL,                                      -- versioning.py:485, dedup filter at :453
    -- versioning.py:84-88 caps change_description at 500 chars.
    change_description  TEXT CHECK (change_description IS NULL OR char_length(change_description) <= 500),
    -- versioning.py:89-92 documents the allowed set; default 'amendment'.
    change_type         TEXT NOT NULL DEFAULT 'amendment'
                        CHECK (change_type IN ('initial', 'amendment', 'correction', 'consolidation', 'repeal')),
    created_by          TEXT NOT NULL DEFAULT 'system',                      -- versioning.py:488 ('user') / :612 ('system')
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),                  -- versioning.py:517, read non-null
    extracted_data      JSONB NOT NULL DEFAULT '{}'::jsonb                   -- versioning.py:489, :305
);

-- versioning.py computes the next version as max(version_number)+1 per document
-- and looks versions up by (document_id, version_number) at :280-281 / :553-554.
-- The unique index enforces that invariant and serves the DESC ordering at :214.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_doc_version
    ON public.document_versions(document_id, version_number);
-- versioning.py:449-455 duplicate-content guard.
CREATE INDEX IF NOT EXISTS idx_document_versions_doc_hash
    ON public.document_versions(document_id, content_hash);

-- RLS: enabled with no permissive policy on purpose. Every read and write goes
-- through backend/app/versioning.py using the service role, which bypasses RLS;
-- no browser client ever queries this table directly (the UI calls
-- /api/documents/[id]/versions, which proxies to the backend). So there is no
-- `authenticated` policy to justify, and the client roles get no grants either.
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.document_versions FROM anon, authenticated;

COMMENT ON TABLE public.document_versions IS
    'Immutable version snapshots of a document, written by backend/app/versioning.py under the service role. document_id is TEXT because callers pass either a judgments.id uuid or a source-formatted id. RLS enabled with no permissive policy: service role only.';

-- =========================================================================
-- audit_logs
-- Written by backend/app/services/audit_service.py and read by
-- backend/app/api/admin.py:377 (/admin activity panel),
-- audit_service.get_user_audit_trail (/api/audit/my-activity) and
-- backend/app/services/retention_service.py — all via the service-role client.
--
-- `user_id` is TEXT, not a uuid FK: retention_service._anonymize_data writes a
-- 16-character SHA-256 prefix into this column (`anonymized_id`, :450 written at :483),
-- which is not a uuid; a uuid column or an auth.users FK would break GDPR
-- anonymization and would delete audit history on user deletion, defeating the
-- 7-year retention requirement.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- admin.py:390
    -- audit_service.py:180 / :245 / :299 / :374; anonymized to a 16-char hash by retention_service.
    user_id              TEXT,
    session_id           TEXT,                                               -- audit_service.py:181
    action_type          TEXT NOT NULL,                                      -- audit_service.py:182, filtered at :452
    input_data           JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- audit_service.py:183
    output_data          JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- audit_service.py:184
    model_used           TEXT,                                               -- audit_service.py:185
    -- Salted SHA-256 prefix, not an IP literal (audit_service._anonymize_ip):
    -- must be TEXT (audit_service.py:186), and is scrubbed to NULL by retention_service.py:461-463.
    ip_address           TEXT,
    user_agent           TEXT,                                               -- audit_service.py:187 (truncated to 500)
    request_duration_ms  INTEGER,                                            -- audit_service.py:190
    resource_type        TEXT,                                               -- audit_service.py:191 / :383
    resource_id          TEXT,                                               -- audit_service.py:254 / :384
    http_method          TEXT,                                               -- audit_service.py:385
    http_status_code     INTEGER,                                            -- audit_service.py:386
    api_endpoint         TEXT,                                               -- audit_service.py:387
    error_message        TEXT,                                               -- audit_service.py:388
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),                 -- set explicitly on insert; ordering key
    -- Not written by code today: the 7-year retention window documented in
    -- backend/docs/reference/audit-trail-api.md:17-31 and consumed by the
    -- `archive_expired_audit_logs` RPC that retention_service.py:90 calls.
    retention_until      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 years')
);

-- admin.py:381-382 orders by created_at DESC with a LIMIT.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON public.audit_logs(created_at DESC);
-- audit_service.get_user_audit_trail: eq(user_id) + gte/lte(created_at) + order DESC.
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
    ON public.audit_logs(user_id, created_at DESC);
-- audit_service.py:452 `.in_("action_type", action_types)` combined with the date range.
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
    ON public.audit_logs(action_type, created_at DESC);

-- RLS: enabled with no permissive policy on purpose. This table powers the ADMIN
-- activity panel and the compliance audit trail; both are served by the backend
-- with the service role after `require_admin` (admin.py) or after scoping to the
-- caller's own user id (audit_service.get_user_audit_trail). No browser client
-- touches the table, so an `authenticated` SELECT policy would only widen the
-- blast radius — every logged-in user would be able to read every other user's
-- activity, IP hashes and prompts. Service role only; grants revoked from the
-- client roles as defence in depth.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audit_logs FROM anon, authenticated;

COMMENT ON TABLE public.audit_logs IS
    'Compliance audit trail (7-year retention) written by AuditService under the service role and read by the /admin activity panel. user_id is TEXT because GDPR anonymization replaces it with a SHA-256 prefix. RLS enabled with no permissive policy: service role only, never readable by authenticated users.';

-- =============================================================================
-- Migration: create the schema domain tables
-- =============================================================================
-- Refs #450.
--
-- `extraction_schemas`, `schema_versions` and `schema_fields` are read and
-- written all over the app but have never had a migration. Without them
-- /schemas cannot list or create, Schema Studio cannot load or save fields,
-- version history and rollback are dead, and extraction's schema fetch
-- (backend/app/extraction_domain/shared.py) 404s before a job is submitted.
--
-- Every column below is derived from a real call site:
--   * extraction_schemas — `_EXTRACTION_SCHEMA_COLS`
--     (backend/app/schemas_pkg/crud.py), the insert payload in
--     frontend/app/api/schemas/route.ts, `select("schema_version")` in
--     backend/app/schemas_pkg/versioning.py + the versions routes, and the
--     explicit column list in backend/scripts/bulk_insert_pl.sql
--     (schema_version, visual_metadata, last_edited_mode, field_count).
--   * schema_versions — the projection in
--     frontend/app/api/schemas/[id]/versions/route.ts plus schema_snapshot /
--     field_snapshot / session_id from versioning.py, playground.py and
--     bulk_insert_pl.sql.
--   * schema_fields — the `SchemaField` interface
--     (frontend/lib/schema-editor/rjsf/types.ts, frontend/types/schema-editor.ts)
--     as read/written by frontend/hooks/schema-editor/useSupabaseSync.ts.
--
-- Type notes:
--   * `text`, `dates`, `schema_snapshot`, `field_snapshot`, `changed_fields`,
--     `diff_from_previous`, `validation_rules` and `visual_metadata` are all
--     JSONB — every writer sends JSON objects/arrays for them.
--   * `session_id` is TEXT, not UUID: the frontend mints
--     `session-<timestamp>-<random>` (frontend/app/schema-chat/page.tsx) and
--     bulk_insert_pl.sql writes `id::text`.
--   * `default_value` is TEXT per `frontend/types/schema-editor.ts`
--     ("stored as string, parsed based on type").
-- =============================================================================


-- =============================================================================
-- public.extraction_schemas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.extraction_schemas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    description      TEXT,
    type             TEXT NOT NULL,
    category         TEXT NOT NULL,
    -- The JSON Schema body. Named `text` for historical reasons; it is JSON.
    text             JSONB NOT NULL,
    dates            JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- NULL user_id marks a system/seeded schema (bulk_insert_pl.sql inserts NULL).
    user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft', 'published', 'review', 'archived')),
    is_verified      BOOLEAN NOT NULL DEFAULT false,
    schema_version   INTEGER NOT NULL DEFAULT 1,
    visual_metadata  JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_edited_mode TEXT CHECK (last_edited_mode IS NULL
                                 OR last_edited_mode IN ('ai', 'visual', 'code')),
    field_count      INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Duplicate-name lookup: `.eq('name', validated.name)` in
-- frontend/app/api/schemas/route.ts and get_schema_by_name() in schemas_db.py.
-- Deliberately NOT unique: uniqueness is enforced in application code (409 /
-- ValidationError) and a hard constraint would break the seeded bulk inserts.
CREATE INDEX IF NOT EXISTS idx_extraction_schemas_name
    ON public.extraction_schemas(name);
CREATE INDEX IF NOT EXISTS idx_extraction_schemas_user_created
    ON public.extraction_schemas(user_id, created_at DESC);
-- Serves the unfiltered listing in GET /schemas/db (ORDER BY created_at DESC).
CREATE INDEX IF NOT EXISTS idx_extraction_schemas_created_at
    ON public.extraction_schemas(created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_extraction_schemas_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_extraction_schemas_set_updated_at ON public.extraction_schemas;
CREATE TRIGGER trg_extraction_schemas_set_updated_at
    BEFORE UPDATE ON public.extraction_schemas
    FOR EACH ROW EXECUTE FUNCTION public.tg_extraction_schemas_set_updated_at();

COMMENT ON TABLE public.extraction_schemas IS
    'User-owned (or system, when user_id IS NULL) extraction schemas. `text` holds the JSON Schema body; `schema_version` is the current version whose history lives in schema_versions.';


-- =============================================================================
-- public.schema_versions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_versions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id          UUID NOT NULL REFERENCES public.extraction_schemas(id) ON DELETE CASCADE,
    version_number     INTEGER NOT NULL,
    schema_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_snapshot     JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Free TEXT on purpose: the two TypeScript unions disagree (schema-playground.ts
    -- adds bulk_import/rollback/merge on top of schema-editor.ts) and
    -- bulk_insert_pl.sql writes 'bulk_import'. A CHECK would reject valid writers.
    change_type        TEXT NOT NULL,
    change_summary     TEXT,
    changed_fields     JSONB,
    diff_from_previous JSONB,
    user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The diff/detail endpoints look a version up by (schema_id, version_number).
    CONSTRAINT schema_versions_schema_id_version_number_key
        UNIQUE (schema_id, version_number)
);

-- The UNIQUE constraint above already indexes (schema_id, version_number), which
-- serves both `.eq('schema_id', …)` and `ORDER BY version_number DESC`.

COMMENT ON TABLE public.schema_versions IS
    'Append-only version history for extraction_schemas. schema_snapshot is the JSON Schema at that version, field_snapshot the full schema_fields array; (schema_id, version_number) is unique.';


-- =============================================================================
-- public.schema_fields
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.schema_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULLABLE on purpose: fields exist in an unsaved editing session before the
    -- schema is persisted (see the ownership note below).
    schema_id       UUID REFERENCES public.extraction_schemas(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL,
    field_path      TEXT NOT NULL,
    field_name      TEXT NOT NULL,
    parent_field_id UUID REFERENCES public.schema_fields(id) ON DELETE CASCADE,
    field_type      TEXT NOT NULL,
    description     TEXT,
    is_required     BOOLEAN NOT NULL DEFAULT false,
    validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    default_value   TEXT,
    position        INTEGER NOT NULL DEFAULT 0,
    visual_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      TEXT NOT NULL DEFAULT 'ai'
                    CHECK (created_by IN ('ai', 'user', 'template')),
    -- Ownership column, see the note below. NULLABLE and defaulted from the JWT
    -- because no writer sends it.
    user_id         UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The two filtered+ordered reads in useSupabaseSync.loadFields():
-- `schema_id=eq.<id> ORDER BY position` and `session_id=eq.<id> ORDER BY position`.
CREATE INDEX IF NOT EXISTS idx_schema_fields_schema_position
    ON public.schema_fields(schema_id, position);
CREATE INDEX IF NOT EXISTS idx_schema_fields_session_position
    ON public.schema_fields(session_id, position);
-- Backs the self-referential ON DELETE CASCADE.
CREATE INDEX IF NOT EXISTS idx_schema_fields_parent_field_id
    ON public.schema_fields(parent_field_id);
-- Backs the RLS predicate below.
CREATE INDEX IF NOT EXISTS idx_schema_fields_user_id
    ON public.schema_fields(user_id);

CREATE OR REPLACE FUNCTION public.tg_schema_fields_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schema_fields_set_updated_at ON public.schema_fields;
CREATE TRIGGER trg_schema_fields_set_updated_at
    BEFORE UPDATE ON public.schema_fields
    FOR EACH ROW EXECUTE FUNCTION public.tg_schema_fields_set_updated_at();

COMMENT ON TABLE public.schema_fields IS
    'Individual field rows behind Schema Studio. schema_id is NULL while the editing session is unsaved (session_id then identifies the draft); ownership is carried by user_id, defaulted from auth.uid(), because the SchemaField interface has no owner column.';


-- =============================================================================
-- RLS
-- =============================================================================
-- The backend uses service_role (bypasses RLS), so these policies only govern
-- the anon/authenticated PostgREST + realtime clients:
--   * frontend/lib/server/schema-detail.ts reads extraction_schemas with the
--     user's access token,
--   * useSupabaseSync reads/writes schema_fields and subscribes to realtime,
--     which enforces RLS for the subscribing user.

ALTER TABLE public.extraction_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_fields      ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- extraction_schemas: owner-scoped writes, owner + system-schema reads.
-- -----------------------------------------------------------------------------
-- SELECT also admits `user_id IS NULL` rows: those are the seeded/system
-- schemas (bulk_insert_pl.sql inserts NULL) that every user is meant to browse
-- and run extractions against. Writes stay strictly owner-scoped so a system
-- schema cannot be hijacked or mutated through the anon client.

DROP POLICY IF EXISTS extraction_schemas_read ON public.extraction_schemas;
CREATE POLICY extraction_schemas_read ON public.extraction_schemas
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS extraction_schemas_owner_insert ON public.extraction_schemas;
CREATE POLICY extraction_schemas_owner_insert ON public.extraction_schemas
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS extraction_schemas_owner_update ON public.extraction_schemas;
CREATE POLICY extraction_schemas_owner_update ON public.extraction_schemas
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS extraction_schemas_owner_delete ON public.extraction_schemas;
CREATE POLICY extraction_schemas_owner_delete ON public.extraction_schemas
    FOR DELETE TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- schema_versions: ownership derived from the parent schema.
-- -----------------------------------------------------------------------------
-- schema_id is NOT NULL here, so the parent lookup always resolves. Read access
-- follows whatever the reader can see in extraction_schemas (own + system);
-- writes require owning the parent schema.

DROP POLICY IF EXISTS schema_versions_read ON public.schema_versions;
CREATE POLICY schema_versions_read ON public.schema_versions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.extraction_schemas s
            WHERE s.id = schema_versions.schema_id
              AND (s.user_id = (SELECT auth.uid()) OR s.user_id IS NULL)
        )
    );

DROP POLICY IF EXISTS schema_versions_owner_write ON public.schema_versions;
CREATE POLICY schema_versions_owner_write ON public.schema_versions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.extraction_schemas s
            WHERE s.id = schema_versions.schema_id
              AND s.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.extraction_schemas s
            WHERE s.id = schema_versions.schema_id
              AND s.user_id = (SELECT auth.uid())
        )
    );

-- -----------------------------------------------------------------------------
-- schema_fields ownership — the tradeoff, spelled out.
-- -----------------------------------------------------------------------------
-- The `SchemaField` interface has no owner column, and no writer sends one:
-- useSupabaseSync does `.upsert(field, { onConflict: 'id' })` with exactly the
-- interface's keys. Deriving ownership purely from
-- `schema_id -> extraction_schemas.user_id` would be clean for persisted rows
-- but leaves *session-only* rows (schema_id IS NULL, the normal state of an
-- unsaved Schema Studio session) matched by no predicate at all — every draft
-- read, upsert and realtime event would be denied, i.e. the editor would be
-- just as broken as it is today with no table.
--
-- Accepted approach: a NULLABLE `user_id` column with `DEFAULT auth.uid()`.
--   * Nullable, never NOT NULL: the frontend does not send `user_id`, and a
--     NOT NULL column would make every existing insert fail.
--   * `DEFAULT auth.uid()` means a row inserted over PostgREST with a user JWT
--     is stamped with its creator automatically, no application change needed.
--     So session-only rows ARE reachable — by their creator only.
--   * The policy is an OR of the two paths: own the row, or own the parent
--     schema. The second path keeps rows readable after a schema is handed the
--     fields, and covers rows whose user_id is NULL but whose schema is owned.
--
-- Consequences to be aware of:
--   * A session-only row written by something that has no JWT (service_role, a
--     backend task, a psql seed) gets `user_id = NULL` AND `schema_id = NULL`,
--     so it matches neither predicate and is invisible to every
--     anon/authenticated client — only service_role sees it. Any backend path
--     that writes draft fields on a user's behalf (the "AI writes to
--     schema_fields" flow in frontend/hooks/schema-editor/README.md) must set
--     `user_id` explicitly or that user's realtime subscription will never fire.
--   * Access is deliberately NOT granted on `session_id` alone. session_id is a
--     guessable `session-<timestamp>-<random>` string, so a session-only
--     predicate would let any authenticated user read someone else's draft.
--   * Anonymous (`anon`) users get no access at all; Schema Studio requires a
--     signed-in user.

DROP POLICY IF EXISTS schema_fields_owner_all ON public.schema_fields;
CREATE POLICY schema_fields_owner_all ON public.schema_fields
    FOR ALL TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.extraction_schemas s
            WHERE s.id = schema_fields.schema_id
              AND s.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.extraction_schemas s
            WHERE s.id = schema_fields.schema_id
              AND s.user_id = (SELECT auth.uid())
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_schemas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schema_versions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schema_fields      TO authenticated;


-- =============================================================================
-- Realtime
-- =============================================================================
-- useSupabaseSync subscribes to postgres_changes on schema_fields; without
-- publication membership Schema Studio silently never updates. Guarded on both
-- sides: `undefined_object` when the publication does not exist (any non-Supabase
-- Postgres, e.g. a scratch verification database) and `duplicate_object` when
-- the table is already a member (re-running this migration).

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.schema_fields;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'publication supabase_realtime not found; skipping realtime registration for public.schema_fields';
    WHEN duplicate_object THEN
        NULL;
END
$$;

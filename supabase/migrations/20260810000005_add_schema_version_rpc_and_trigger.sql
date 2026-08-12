-- =============================================================================
-- Migration: schema version history trigger + rollback_to_version RPC
-- =============================================================================
-- Refs #453.
--
-- 20260810000002 created `extraction_schemas`, `schema_versions` and
-- `schema_fields`. Two database objects the application calls were still
-- missing, and each left a Schema Studio feature dead:
--
--   1. `public.rollback_to_version(p_schema_id, p_version_number)` — called by
--      * frontend/app/api/schemas/[id]/versions/route.ts (POST)
--      * frontend/app/api/schemas/[id]/versions/[version]/rollback/route.ts
--      * backend/app/schemas_pkg/versioning.py (rollback_schema_version)
--      All three pass exactly `p_schema_id` + `p_version_number` (PostgREST
--      matches RPC arguments by NAME — a rename here is a 404 at runtime), and
--      the two that read the result treat it as the UUID of the newly created
--      version row (`new_version_id`), so the function RETURNS uuid.
--
--   2. `create_schema_version_trigger` on `extraction_schemas` — the name is
--      hard-coded in backend/scripts/bulk_insert_pl.sql:5
--      (`ALTER TABLE extraction_schemas DISABLE TRIGGER
--        create_schema_version_trigger;`), which fails outright when the trigger
--      does not exist. Nothing in frontend/ or backend/ ever inserts into
--      `schema_versions` (the sole exception is the manual v1 backfill at the
--      end of bulk_insert_pl.sql), so this trigger is the only thing that can
--      populate version history.
--
-- Design notes
-- ------------
-- * `schema_snapshot` is the `text` column verbatim, NOT the whole
--   extraction_schemas row: backend/app/playground.py builds its schema dict as
--   `{"text": version_data["schema_snapshot"], ...}`, and bulk_insert_pl.sql
--   writes `text::jsonb`. Rollback therefore restores `text` (plus the derived
--   `field_count`), not name/description/category.
-- * `field_snapshot` is the full `schema_fields` row for every field of the
--   schema (`to_jsonb(f)`), a superset of the `SchemaFieldSnapshot` interface in
--   frontend/types/schema-playground.ts. The extra columns (session_id,
--   created_by, default_value, user_id) are what makes a rollback able to
--   reinstate rows faithfully instead of half-populating NOT NULL columns.
-- * `version_number` is allocated as `COALESCE(MAX(version_number), 0) + 1`
--   inside the same INSERT ... SELECT, under a transaction-scoped advisory lock
--   keyed on the schema id. Both halves are needed. A single-statement MAX is
--   still not atomic across transactions under READ COMMITTED — it cannot see an
--   uncommitted sibling row — and rollback_to_version() allocates its version
--   before it updates the extraction_schemas row, so the row lock does not order
--   it against a concurrent edit. Verified both ways: with the lock, two
--   overlapping rollbacks of one schema serialize and get versions n and n+1;
--   with the lock removed, the second one dies on the UNIQUE
--   (schema_id, version_number) constraint.
-- * `change_type` is left unconstrained, exactly as 20260810000002 chose. The
--   two TypeScript unions disagree (schema-editor.ts has 5 values,
--   schema-playground.ts 8) and bulk_insert_pl.sql writes `bulk_import`. The
--   values written here are all in the intersection of what the renderers
--   handle (VersionsTab.tsx, SchemaVersionHistory.tsx, both of which also have a
--   default branch):
--       INSERT                        -> 'create'
--       UPDATE, last_edited_mode 'ai' -> 'ai_update'
--       UPDATE, 'visual'              -> 'visual_edit'
--       UPDATE, 'code' or NULL        -> 'code_edit'
--       rollback_to_version()         -> 'rollback'
--   NULL maps to 'code_edit' because the plain API edit path
--   (frontend/app/api/schemas/route.ts PUT) never sets last_edited_mode.
-- * Every version-producing UPDATE appends a row; no no-op suppression. Fields
--   live in a separate table, so an edit that only reshuffles `schema_fields`
--   and then touches the parent must still be recorded.
-- * Both SECURITY DEFINER functions pin `SET search_path = ''` and fully qualify
--   every object, matching the hardening in 20260623000001.
--   Measured, not assumed: the trigger also works as SECURITY INVOKER for an
--   `authenticated` user editing their own schema, because
--   schema_versions_owner_write / schema_fields_owner_all already admit that
--   case. SECURITY DEFINER is kept deliberately, for two reasons:
--     - snapshot completeness. `field_snapshot` must be the whole truth about
--       the schema's fields; under the invoker's RLS view any schema_fields row
--       the caller cannot see is silently dropped from the snapshot instead of
--       raising, which would corrupt history and hence rollback. The trigger
--       must not be at the mercy of who happened to trigger it.
--     - version history must not become writable-by-accident-only. The trigger
--       keeps working if a later migration tightens schema_versions to
--       append-only / service-role-only writes, which is where that table wants
--       to end up.
--   rollback_to_version is SECURITY DEFINER for the same snapshot reason and
--   therefore re-checks ownership by hand (see the authorization block) —
--   without that check any signed-in user could roll back anybody's schema.
--
-- Rollback of this migration: DROP TRIGGER create_schema_version_trigger ON
-- public.extraction_schemas; DROP FUNCTION public.rollback_to_version(uuid, int),
-- public.tg_extraction_schemas_create_version(),
-- public.schema_field_snapshot_diff(jsonb, jsonb). No data is modified.
-- =============================================================================


-- =============================================================================
-- 1. Field-snapshot diff helper
-- =============================================================================
-- Produces the `VersionDiff` shape from frontend/types/schema-playground.ts
-- ({added_fields, removed_fields, modified_fields}: string[] of field paths) by
-- comparing two `field_snapshot` arrays. Pure: no table access, no elevated
-- privilege, IMMUTABLE. `id`/`created_at`/`updated_at`/`session_id` are stripped
-- before comparing bodies so a field that was only re-keyed does not read as
-- modified.

CREATE OR REPLACE FUNCTION public.schema_field_snapshot_diff(
    p_old jsonb,
    p_new jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    WITH old_arr AS (
        SELECT CASE
                   WHEN pg_catalog.jsonb_typeof(COALESCE(p_old, '[]'::jsonb)) = 'array'
                       THEN COALESCE(p_old, '[]'::jsonb)
                   ELSE '[]'::jsonb
               END AS v
    ), new_arr AS (
        SELECT CASE
                   WHEN pg_catalog.jsonb_typeof(COALESCE(p_new, '[]'::jsonb)) = 'array'
                       THEN COALESCE(p_new, '[]'::jsonb)
                   ELSE '[]'::jsonb
               END AS v
    ), old_f AS (
        SELECT e.value ->> 'field_path' AS path,
               e.value - 'id' - 'created_at' - 'updated_at' - 'session_id' AS body
        FROM old_arr, pg_catalog.jsonb_array_elements(old_arr.v) AS e(value)
        WHERE e.value ->> 'field_path' IS NOT NULL
    ), new_f AS (
        SELECT e.value ->> 'field_path' AS path,
               e.value - 'id' - 'created_at' - 'updated_at' - 'session_id' AS body
        FROM new_arr, pg_catalog.jsonb_array_elements(new_arr.v) AS e(value)
        WHERE e.value ->> 'field_path' IS NOT NULL
    ), joined AS (
        SELECT COALESCE(n.path, o.path) AS path,
               o.body AS old_body,
               n.body AS new_body
        FROM old_f o
        FULL JOIN new_f n ON n.path = o.path
    )
    SELECT pg_catalog.jsonb_build_object(
        'added_fields',
        COALESCE(pg_catalog.jsonb_agg(path ORDER BY path)
                 FILTER (WHERE old_body IS NULL), '[]'::jsonb),
        'removed_fields',
        COALESCE(pg_catalog.jsonb_agg(path ORDER BY path)
                 FILTER (WHERE new_body IS NULL), '[]'::jsonb),
        'modified_fields',
        COALESCE(pg_catalog.jsonb_agg(path ORDER BY path)
                 FILTER (WHERE old_body IS NOT NULL
                           AND new_body IS NOT NULL
                           AND old_body <> new_body), '[]'::jsonb)
    )
    FROM joined;
$$;

REVOKE ALL ON FUNCTION public.schema_field_snapshot_diff(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schema_field_snapshot_diff(jsonb, jsonb)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.schema_field_snapshot_diff(jsonb, jsonb) IS
    'Compares two schema_versions.field_snapshot arrays and returns the VersionDiff shape {added_fields, removed_fields, modified_fields} as arrays of field_path. Pure helper for the version trigger and rollback_to_version.';


-- =============================================================================
-- 2. Version-snapshot trigger function
-- =============================================================================
-- AFTER INSERT OR UPDATE, not BEFORE. A BEFORE INSERT trigger cannot write
-- schema_versions at all: the row it inserts references extraction_schemas(id),
-- and the FK is checked before the parent INSERT has placed the tuple, so it
-- fails with `schema_versions_schema_id_fkey`. (This is almost certainly the
-- "foreign key constraint issues" that made backend/scripts/bulk_insert_pl.sql
-- disable the trigger in the first place.)
--
-- Because the trigger is AFTER, `NEW.schema_version` cannot be assigned; it is
-- synced with a nested UPDATE, made non-recursive by the same suppression flag
-- rollback_to_version uses. Nothing in the application maintains
-- `schema_version` (grep: only reads), yet both versions routes and
-- versioning.py report it as `current_version` and the rollback routes read it
-- back as `new_version`, so keeping it in step with schema_versions is part of
-- the contract. On INSERT the allocated number is always 1, which equals the
-- column default, so the nested UPDATE only ever fires on UPDATE.

CREATE OR REPLACE FUNCTION public.tg_extraction_schemas_create_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_change_type    text;
    v_change_summary text;
    v_fields         jsonb;
    v_prev_fields    jsonb;
    v_diff           jsonb;
    v_changed        jsonb;
    v_version        integer;
BEGIN
    -- rollback_to_version() writes its own 'rollback' version row and then
    -- updates extraction_schemas; without this guard that UPDATE would append a
    -- second, misleading version.
    IF COALESCE(
           pg_catalog.current_setting('juddges.suppress_schema_version_trigger', true),
           ''
       ) = 'on'
    THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_change_type    := 'create';
        v_change_summary := 'Schema created';
    ELSE
        v_change_type := CASE NEW.last_edited_mode
                             WHEN 'ai'     THEN 'ai_update'
                             WHEN 'visual' THEN 'visual_edit'
                             ELSE 'code_edit'
                         END;
        v_change_summary := 'Schema updated';
    END IF;

    -- Full schema_fields rows for this schema; '[]' on INSERT, where the fields
    -- do not exist yet (Schema Studio writes them after the schema is saved).
    SELECT COALESCE(
               pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.position, f.field_path),
               '[]'::jsonb
           )
      INTO v_fields
      FROM public.schema_fields f
     WHERE f.schema_id = NEW.id;

    -- Serialize version allocation per schema. `MAX(version_number) + 1` cannot
    -- see another transaction's uncommitted row, and rollback_to_version()
    -- allocates its version BEFORE it touches the extraction_schemas row — so
    -- the row lock alone does not order the two, and both would pick the same
    -- number. Measured: dropping this lock reproduces
    -- `duplicate key value violates unique constraint
    --  "schema_versions_schema_id_version_number_key"`.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('public.schema_versions'),
        pg_catalog.hashtext(NEW.id::text)
    );

    IF TG_OP = 'UPDATE' THEN
        SELECT v.field_snapshot
          INTO v_prev_fields
          FROM public.schema_versions v
         WHERE v.schema_id = NEW.id
         ORDER BY v.version_number DESC
         LIMIT 1;

        IF v_prev_fields IS NOT NULL THEN
            v_diff := public.schema_field_snapshot_diff(v_prev_fields, v_fields);
            v_changed := (v_diff -> 'added_fields')
                         || (v_diff -> 'removed_fields')
                         || (v_diff -> 'modified_fields');
            IF pg_catalog.jsonb_array_length(v_changed) = 0 THEN
                v_changed := NULL;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.schema_versions (
        schema_id,
        version_number,
        schema_snapshot,
        field_snapshot,
        change_type,
        change_summary,
        changed_fields,
        diff_from_previous,
        user_id,
        session_id
    )
    SELECT
        NEW.id,
        COALESCE(pg_catalog.max(v.version_number), 0) + 1,
        COALESCE(NEW.text, '{}'::jsonb),
        v_fields,
        v_change_type,
        v_change_summary,
        v_changed,
        v_diff,
        NEW.user_id,
        NULL
      FROM public.schema_versions v
     WHERE v.schema_id = NEW.id
    RETURNING version_number INTO v_version;

    IF NEW.schema_version IS DISTINCT FROM v_version THEN
        PERFORM pg_catalog.set_config(
            'juddges.suppress_schema_version_trigger', 'on', true
        );
        UPDATE public.extraction_schemas s
           SET schema_version = v_version
         WHERE s.id = NEW.id;
        PERFORM pg_catalog.set_config(
            'juddges.suppress_schema_version_trigger', 'off', true
        );
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_extraction_schemas_create_version() FROM PUBLIC;

COMMENT ON FUNCTION public.tg_extraction_schemas_create_version() IS
    'Appends a schema_versions row snapshotting extraction_schemas.text and the schema''s schema_fields on every insert/update, and stamps the allocated version_number onto NEW.schema_version.';

DROP TRIGGER IF EXISTS create_schema_version_trigger ON public.extraction_schemas;
CREATE TRIGGER create_schema_version_trigger
    AFTER INSERT OR UPDATE ON public.extraction_schemas
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_extraction_schemas_create_version();

-- The name is load-bearing: backend/scripts/bulk_insert_pl.sql disables and
-- re-enables `create_schema_version_trigger` by name.


-- =============================================================================
-- 3. public.rollback_to_version(p_schema_id, p_version_number)
-- =============================================================================
-- Argument names are fixed by the three PostgREST/supabase-py callers listed at
-- the top of this file. Returns the id of the new 'rollback' version row, which
-- the rollback routes surface as `new_version_id`.

CREATE OR REPLACE FUNCTION public.rollback_to_version(
    p_schema_id      uuid,
    p_version_number integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor         uuid;
    v_owner         uuid;
    v_owner_found   boolean;
    v_from_version  integer;
    v_target        public.schema_versions;
    v_current       jsonb;
    v_diff          jsonb;
    v_changed       jsonb;
    v_new_id        uuid;
    v_new_version   integer;
    v_field_count   integer;
BEGIN
    SELECT s.user_id, s.schema_version, true
      INTO v_owner, v_from_version, v_owner_found
      FROM public.extraction_schemas s
     WHERE s.id = p_schema_id;

    IF NOT COALESCE(v_owner_found, false) THEN
        RAISE EXCEPTION 'schema % not found', p_schema_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Authorization. This function is SECURITY DEFINER, so it bypasses the
    -- owner-scoped RLS policies on all three tables and has to re-check by
    -- hand. `auth.uid()` is NULL only for the service-role backend client
    -- (EXECUTE is revoked from PUBLIC/anon below, so an anonymous PostgREST
    -- caller never reaches this line). A signed-in user may roll back their own
    -- schemas only — never a system schema (user_id IS NULL), matching
    -- extraction_schemas_owner_update.
    v_actor := (SELECT auth.uid());
    IF v_actor IS NOT NULL AND (v_owner IS NULL OR v_owner <> v_actor) THEN
        RAISE EXCEPTION 'permission denied to roll back schema %', p_schema_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT *
      INTO v_target
      FROM public.schema_versions v
     WHERE v.schema_id = p_schema_id
       AND v.version_number = p_version_number;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'version % not found for schema %',
            p_version_number, p_schema_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Field snapshot of the state we are leaving, for the diff on the new row.
    SELECT COALESCE(
               pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.position, f.field_path),
               '[]'::jsonb
           )
      INTO v_current
      FROM public.schema_fields f
     WHERE f.schema_id = p_schema_id;

    v_diff := public.schema_field_snapshot_diff(v_current, v_target.field_snapshot);
    v_changed := NULLIF(
        (v_diff -> 'added_fields')
        || (v_diff -> 'removed_fields')
        || (v_diff -> 'modified_fields'),
        '[]'::jsonb
    );

    -- Same per-schema serialization as the trigger.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('public.schema_versions'),
        pg_catalog.hashtext(p_schema_id::text)
    );

    -- Record the rollback as a NEW version first, so the number it allocates can
    -- be stamped onto extraction_schemas.schema_version below.
    INSERT INTO public.schema_versions (
        schema_id,
        version_number,
        schema_snapshot,
        field_snapshot,
        change_type,
        change_summary,
        changed_fields,
        diff_from_previous,
        user_id,
        session_id
    )
    SELECT
        p_schema_id,
        COALESCE(pg_catalog.max(v.version_number), 0) + 1,
        v_target.schema_snapshot,
        v_target.field_snapshot,
        'rollback',
        pg_catalog.format('Rolled back to version %s', p_version_number),
        v_changed,
        v_diff || pg_catalog.jsonb_build_object(
                      'rollback_from_version', v_from_version,
                      'rollback_to_version', p_version_number
                  ),
        COALESCE(v_actor, v_owner),
        v_target.session_id
      FROM public.schema_versions v
     WHERE v.schema_id = p_schema_id
    RETURNING id, version_number INTO v_new_id, v_new_version;

    -- `field_count` mirrors the number of top-level keys in `text`
    -- (bulk_insert_pl.sql: 11 keys -> field_count 11).
    v_field_count := CASE
        WHEN pg_catalog.jsonb_typeof(COALESCE(v_target.schema_snapshot, '{}'::jsonb)) = 'object'
            THEN (SELECT pg_catalog.count(*)::integer
                    FROM pg_catalog.jsonb_object_keys(v_target.schema_snapshot))
        ELSE NULL
    END;

    -- Suppress the trigger for the restore UPDATE: the version row above is the
    -- record of this change.
    PERFORM pg_catalog.set_config('juddges.suppress_schema_version_trigger', 'on', true);

    UPDATE public.extraction_schemas s
       SET text           = COALESCE(v_target.schema_snapshot, s.text),
           field_count    = COALESCE(v_field_count, s.field_count),
           schema_version = v_new_version,
           updated_at     = pg_catalog.now()
     WHERE s.id = p_schema_id;

    -- Reinstate the fields exactly as snapshotted. A snapshot of '[]' (e.g. the
    -- v1 rows backfilled by bulk_insert_pl.sql) therefore clears the fields —
    -- that is what rolling back to that version means.
    DELETE FROM public.schema_fields f WHERE f.schema_id = p_schema_id;

    IF pg_catalog.jsonb_typeof(COALESCE(v_target.field_snapshot, '[]'::jsonb)) = 'array' THEN
        INSERT INTO public.schema_fields (
            id, schema_id, session_id, field_path, field_name, parent_field_id,
            field_type, description, is_required, validation_rules, default_value,
            position, visual_metadata, created_by, user_id, created_at, updated_at
        )
        SELECT
            COALESCE(r.id, pg_catalog.gen_random_uuid()),
            p_schema_id,
            COALESCE(r.session_id, p_schema_id::text),
            r.field_path,
            r.field_name,
            r.parent_field_id,
            r.field_type,
            r.description,
            COALESCE(r.is_required, false),
            COALESCE(r.validation_rules, '{}'::jsonb),
            r.default_value,
            COALESCE(r.position, 0),
            COALESCE(r.visual_metadata, '{}'::jsonb),
            COALESCE(r.created_by, 'ai'),
            COALESCE(r.user_id, v_owner),
            COALESCE(r.created_at, pg_catalog.now()),
            pg_catalog.now()
          FROM pg_catalog.jsonb_array_elements(v_target.field_snapshot) AS e(value)
          CROSS JOIN LATERAL pg_catalog.jsonb_populate_record(
              NULL::public.schema_fields, e.value
          ) AS r
         WHERE r.field_path IS NOT NULL
           AND r.field_name IS NOT NULL
           AND r.field_type IS NOT NULL;
    END IF;

    PERFORM pg_catalog.set_config('juddges.suppress_schema_version_trigger', 'off', true);

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_to_version(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_to_version(uuid, integer)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.rollback_to_version(uuid, integer) IS
    'Restores extraction_schemas.text and schema_fields for p_schema_id from the schema_versions row p_version_number, records the rollback as a new version (change_type ''rollback'', diff_from_previous carrying rollback_from_version/rollback_to_version) and returns that new version''s id. Argument names are matched by name by PostgREST — do not rename.';

-- =============================================================================
-- Migration: public.create_document_version() — atomic document version append
-- =============================================================================
-- Refs #461.
--
-- `backend/app/versioning.py` had two sites that allocated
-- `document_versions.version_number` with a separate `MAX(version_number)` read
-- followed by a PostgREST insert:
--
--   * create_version_snapshot  (POST /documents/{id}/versions)
--   * revert_to_version        (POST /documents/{id}/versions/revert, the
--                               pre-revert snapshot)
--
-- Two concurrent callers for the same document read the same MAX and the second
-- insert dies on `idx_document_versions_doc_version`
-- (UNIQUE (document_id, version_number), 20260810000004) with a 500. Before that
-- unique index existed the same race produced two rows sharing a version number
-- — silently, which is worse.
--
-- Why the allocation has to live in a database function
-- ----------------------------------------------------
-- Folding the read into the write (`INSERT ... SELECT COALESCE(MAX(...),0)+1`)
-- is NOT sufficient. Under READ COMMITTED the aggregate reads the snapshot taken
-- at statement start and cannot see a concurrent transaction's uncommitted row,
-- so both callers still compute the same next value. Statement atomicity is not
-- serialization against other transactions. This is the same conclusion #453
-- reached for `schema_versions` (see 20260810000005).
--
-- An "allocate-only" RPC that hands a number back to Python does not work
-- either: `pg_advisory_xact_lock` is released at transaction end, and every
-- PostgREST call is its own transaction, so the lock would be gone before Python
-- issued the INSERT. The lock, the duplicate check and the INSERT must share one
-- transaction, which means they must share one function.
--
-- Ordering inside the function
-- ----------------------------
--   1. per-document advisory lock
--   2. duplicate-content check
--   3. version_number allocation
--   4. INSERT ... RETURNING
--
-- Putting the duplicate check *inside* the lock fixes a second race that the old
-- Python code had: two identical concurrent snapshots could both pass the
-- `(document_id, content_hash)` lookup and both insert, because nothing ordered
-- the check against the other transaction's insert.
--
-- The lock is the two-argument `pg_advisory_xact_lock(int, int)` form used by
-- 20260810000005, namespaced on the table name rather than the bare
-- `hashtext(document_id)` single-argument form: the (int, int) space is disjoint
-- from the bigint space, so a document id cannot collide with an unrelated
-- single-argument advisory lock, and `hashtext('public.document_versions')`
-- keeps it disjoint from the `schema_versions` locks as well. Per-document
-- keying is deliberate — snapshots of different documents must not serialize.
--
-- p_reject_duplicate_content
-- --------------------------
-- The duplicate-content guard belongs to the manual-snapshot endpoint, not to
-- version allocation, so it is a parameter defaulting to true rather than
-- unconditional. `revert_to_version` passes false: it never had that guard, and
-- adding it would break the common idempotent case (after a revert the document
-- content equals the target version's content, so re-reverting to the same
-- version — a 200 today — would start returning 409).
--
-- Signalling the duplicate
-- ------------------------
-- SQLSTATE 'P0409' (custom, in the PL/pgSQL P0 class) with the message text
-- versioning.py already returned, carrying the existing version number:
--     A version with identical content already exists (version 3)
-- The Python caller matches on `PostgrestAPIError.code == 'P0409'` and re-raises
-- HTTP 409 with `PostgrestAPIError.message` verbatim, so the wire response is
-- byte-identical to the pre-RPC behaviour. A distinct SQLSTATE is what makes the
-- mapping unambiguous — matching on message text would be fragile, and 'P0001'
-- (the bare RAISE default) is indistinguishable from any other RAISE.
--
-- Privileges
-- ----------
-- EXECUTE goes to `service_role` only — not `authenticated`, unlike
-- `public.rollback_to_version` in 20260810000005. `document_versions` has RLS
-- enabled with no permissive policy at all and `REVOKE ALL ... FROM anon,
-- authenticated` (20260810000004): it is a service-role-only table, written and
-- read exclusively by backend/app/versioning.py, and the browser reaches version
-- history through /api/documents/[id]/versions -> the backend, never PostgREST.
-- Since the function is SECURITY DEFINER it bypasses RLS by construction, so
-- granting EXECUTE to `authenticated` would hand every signed-in user a way to
-- append arbitrary version rows to any document — precisely what the table's
-- privilege stance forbids. `rollback_to_version` can afford `authenticated`
-- because it re-checks ownership by hand against extraction_schemas.user_id;
-- `document_versions` has no owner column to check, so the only correct grant is
-- the service role. There is deliberately no per-user authorization block here
-- for the same reason.
--
-- SECURITY DEFINER is kept even though `service_role` has BYPASSRLS anyway, for
-- the same reason 20260810000005 gives: the function must keep working if a
-- later migration tightens `document_versions` to append-only, and it must not
-- be at the mercy of the caller's RLS view when it computes MAX(version_number)
-- — a filtered view of existing versions would allocate a number that is already
-- taken. `SET search_path = ''` plus fully qualified names, matching the
-- hardening in 20260623000001.
--
-- Rollback of this migration:
--   DROP FUNCTION public.create_document_version(
--       text, text, text, text, text, text, text, text, jsonb, boolean);
-- No data is modified.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_document_version(
    p_document_id              text,
    p_title                    text,
    p_full_text                text,
    p_summary                  text,
    p_content_hash             text,
    p_change_description       text,
    p_change_type              text,
    p_created_by               text,
    p_extracted_data           jsonb,
    p_reject_duplicate_content boolean DEFAULT true
)
RETURNS SETOF public.document_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_version integer;
BEGIN
    -- 1. Serialize every version append for this document. Released at
    -- transaction end, so there is nothing to clean up. Measured: with this line
    -- removed, two overlapping calls for one document both allocate the same
    -- number and the second one dies on
    -- `duplicate key value violates unique constraint
    --  "idx_document_versions_doc_version"`.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('public.document_versions'),
        pg_catalog.hashtext(p_document_id)
    );

    -- 2. Duplicate-content guard, inside the lock so two identical concurrent
    -- snapshots cannot both pass it.
    IF p_reject_duplicate_content THEN
        SELECT v.version_number
          INTO v_existing_version
          FROM public.document_versions v
         WHERE v.document_id = p_document_id
           AND v.content_hash = p_content_hash
         ORDER BY v.version_number
         LIMIT 1;

        IF v_existing_version IS NOT NULL THEN
            RAISE EXCEPTION
                'A version with identical content already exists (version %)',
                v_existing_version
                USING ERRCODE = 'P0409';
        END IF;
    END IF;

    -- 3 + 4. Allocate and insert in one statement, under the lock. The aggregate
    -- over an empty set yields one row, so a document's first version is 1.
    RETURN QUERY
    INSERT INTO public.document_versions (
        document_id,
        version_number,
        title,
        full_text,
        summary,
        content_hash,
        change_description,
        change_type,
        created_by,
        extracted_data
    )
    SELECT
        p_document_id,
        COALESCE(pg_catalog.max(v.version_number), 0) + 1,
        p_title,
        p_full_text,
        p_summary,
        p_content_hash,
        p_change_description,
        COALESCE(p_change_type, 'amendment'),
        COALESCE(p_created_by, 'system'),
        COALESCE(p_extracted_data, '{}'::jsonb)
      FROM public.document_versions v
     WHERE v.document_id = p_document_id
    RETURNING public.document_versions.*;
END;
$$;

REVOKE ALL ON FUNCTION public.create_document_version(
    text, text, text, text, text, text, text, text, jsonb, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_document_version(
    text, text, text, text, text, text, text, text, jsonb, boolean
) TO service_role;

COMMENT ON FUNCTION public.create_document_version(
    text, text, text, text, text, text, text, text, jsonb, boolean
) IS
    'Appends one document_versions row for p_document_id, allocating version_number as MAX+1 under a per-document pg_advisory_xact_lock so concurrent callers get N and N+1 instead of colliding on idx_document_versions_doc_version. Unless p_reject_duplicate_content is false, raises SQLSTATE P0409 ''A version with identical content already exists (version N)'' when (document_id, content_hash) already exists. Returns the inserted row. Argument names are matched by name by PostgREST (backend/app/versioning.py) — do not rename.';

-- =============================================================================
-- Migration: Enable RLS on document_chunks and judgment_base_extractions,
-- tighten judgments write policies.
-- =============================================================================
-- Pre-public-release security audit (see PR / security-audit-juddges-app.md)
-- found:
-- 1. document_chunks and judgment_base_extractions had grants but no
--    RLS enabled, exposing all rows via PostgREST once anyone signs up.
-- 2. judgments had WITH CHECK (true) on write, letting any authenticated
--    user insert/update legal records.
--
-- This migration enables RLS on (1) and restricts writes on (2). To roll
-- back, reverse: ALTER TABLE ... DISABLE ROW LEVEL SECURITY and restore
-- the prior policy definitions.
--
-- Notes on tables:
-- - public.document_chunks  : created in 20260310000001 — embeddings of text
--                             chunks for semantic search. Read access is part
--                             of the public legal-research product, so we
--                             allow anon + authenticated SELECT, write only
--                             via service_role (backend ingestion).
-- - public.judgment_base_extractions :
--                             The audit name refers to the base-extraction
--                             columns added to public.judgments by migration
--                             20260226000001 (no separate physical table is
--                             created — base_* columns live on judgments).
--                             The public.judgments table already has RLS
--                             enabled, so this migration ensures the
--                             extraction-specific surface stays consistent
--                             with the tightened judgments policies (admin
--                             or service_role for writes; public read).
-- - public.judgments        : RLS enabled in 20260210000003, but write
--                             policies used WITH CHECK (true) — replaced
--                             below with admin-only / service_role checks.
-- =============================================================================


-- =============================================================================
-- 1. public.document_chunks — enable RLS and add policies
-- =============================================================================

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Drop any prior policy variants to keep the migration idempotent
DROP POLICY IF EXISTS "Public read access for document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Service role full access on document_chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Admins can manage document_chunks" ON public.document_chunks;

-- Public read: chunks back the public semantic-search product, so anyone
-- (anon or authenticated) needs SELECT to see search results. This mirrors
-- the "Public read access for judgments" policy.
CREATE POLICY "Public read access for document_chunks"
ON public.document_chunks
FOR SELECT
USING (true);

-- Service role: backend ingestion / re-embedding pipeline writes here.
-- Note: service_role typically bypasses RLS, but we add an explicit policy
-- so behavior is observable in pg_policies and survives any future
-- FORCE ROW LEVEL SECURITY toggle.
CREATE POLICY "Service role full access on document_chunks"
ON public.document_chunks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Admins (profiles.role = 'admin') can manage chunks via the dashboard /
-- maintenance UI without needing a service-role key in the browser.
CREATE POLICY "Admins can manage document_chunks"
ON public.document_chunks
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMENT ON POLICY "Public read access for document_chunks" ON public.document_chunks IS
    'Allows anyone to read chunks - required for the public semantic-search UI';
COMMENT ON POLICY "Service role full access on document_chunks" ON public.document_chunks IS
    'Backend service role has unrestricted access for ingestion and embedding maintenance';
COMMENT ON POLICY "Admins can manage document_chunks" ON public.document_chunks IS
    'Admin profile users can manage chunks (dashboard / maintenance flows)';


-- =============================================================================
-- 2. public.judgment_base_extractions — enable RLS if (and only if) the table
--    actually exists as a separate object. The migration name in the audit
--    refers to base_* columns on public.judgments, but a future schema split
--    may materialise these as a physical table. Guard with to_regclass so
--    this migration is safe either way.
-- =============================================================================

DO $$
BEGIN
    IF to_regclass('public.judgment_base_extractions') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.judgment_base_extractions ENABLE ROW LEVEL SECURITY';

        EXECUTE 'DROP POLICY IF EXISTS "Public read access for judgment_base_extractions" ON public.judgment_base_extractions';
        EXECUTE 'DROP POLICY IF EXISTS "Service role full access on judgment_base_extractions" ON public.judgment_base_extractions';
        EXECUTE 'DROP POLICY IF EXISTS "Admins can manage judgment_base_extractions" ON public.judgment_base_extractions';

        -- Public read: extraction outputs are surfaced in the public UI alongside
        -- the parent judgment, so SELECT is open. Tighten to authenticated-only
        -- if/when these become non-public.
        EXECUTE $p$
            CREATE POLICY "Public read access for judgment_base_extractions"
            ON public.judgment_base_extractions
            FOR SELECT
            USING (true)
        $p$;

        -- Service role: backend extraction pipeline writes here.
        EXECUTE $p$
            CREATE POLICY "Service role full access on judgment_base_extractions"
            ON public.judgment_base_extractions
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true)
        $p$;

        -- Admins can manage extractions through the dashboard.
        EXECUTE $p$
            CREATE POLICY "Admins can manage judgment_base_extractions"
            ON public.judgment_base_extractions
            FOR ALL
            TO authenticated
            USING (public.is_admin())
            WITH CHECK (public.is_admin())
        $p$;

        RAISE NOTICE 'RLS enabled on public.judgment_base_extractions and policies installed';
    ELSE
        RAISE NOTICE 'public.judgment_base_extractions is not a physical table (base_* columns live on public.judgments) — skipping. Judgments-level RLS is tightened in section 3 below.';
    END IF;
END $$;


-- =============================================================================
-- 3. public.judgments — replace permissive WITH CHECK (true) write policies
--    with admin / service_role gated equivalents.
-- =============================================================================

-- Drop the audit-flagged permissive policies (defined in 20260210000003)
DROP POLICY IF EXISTS "Authenticated users can insert judgments" ON public.judgments;
DROP POLICY IF EXISTS "Authenticated users can update judgments" ON public.judgments;

-- Also drop any prior runs of the new policy names to keep this idempotent
DROP POLICY IF EXISTS "Only admins can insert judgments" ON public.judgments;
DROP POLICY IF EXISTS "Only admins can update judgments" ON public.judgments;
DROP POLICY IF EXISTS "Only admins can delete judgments" ON public.judgments;

-- Restrictive INSERT: only admins (via profiles.role='admin') may insert
-- through PostgREST. service_role bypasses RLS / is also covered by the
-- existing "Service role has full access" policy from 20260210000003.
CREATE POLICY "Only admins can insert judgments"
ON public.judgments
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Restrictive UPDATE: same gating for updates.
CREATE POLICY "Only admins can update judgments"
ON public.judgments
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Restrictive DELETE: previously not policied, which (combined with the
-- GRANT SELECT, INSERT, UPDATE that excludes DELETE) meant non-admins
-- couldn't delete anyway — but make it explicit so a future grant doesn't
-- accidentally re-open the door.
CREATE POLICY "Only admins can delete judgments"
ON public.judgments
FOR DELETE
TO authenticated
USING (public.is_admin());

COMMENT ON POLICY "Only admins can insert judgments" ON public.judgments IS
    'Only profiles.role=admin (or service_role via separate policy) may insert judgments';
COMMENT ON POLICY "Only admins can update judgments" ON public.judgments IS
    'Only profiles.role=admin (or service_role via separate policy) may update judgments';
COMMENT ON POLICY "Only admins can delete judgments" ON public.judgments IS
    'Only profiles.role=admin (or service_role via separate policy) may delete judgments';


-- =============================================================================
-- 4. Verification — fail loud if RLS didn't land where we expected.
-- =============================================================================

DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'document_chunks' AND relnamespace = 'public'::regnamespace) THEN
        RAISE EXCEPTION 'RLS is NOT enabled on public.document_chunks';
    END IF;

    IF to_regclass('public.judgment_base_extractions') IS NOT NULL THEN
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'judgment_base_extractions' AND relnamespace = 'public'::regnamespace) THEN
            RAISE EXCEPTION 'RLS is NOT enabled on public.judgment_base_extractions';
        END IF;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'judgments' AND relnamespace = 'public'::regnamespace) THEN
        RAISE EXCEPTION 'RLS is NOT enabled on public.judgments (regression!)';
    END IF;

    -- Make sure the permissive write policies are gone
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'judgments'
                 AND policyname IN ('Authenticated users can insert judgments',
                                    'Authenticated users can update judgments')) THEN
        RAISE EXCEPTION 'Permissive judgments write policies still present — drop did not apply';
    END IF;

    RAISE NOTICE 'RLS hardening verified: document_chunks RLS on, judgments writes admin-only';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

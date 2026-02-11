-- =============================================================================
-- Migration: Enable Row Level Security (RLS) and Create Policies
-- =============================================================================
-- This migration enables Row Level Security on the judgments table and creates
-- policies to control access based on authentication status.
--
-- Security Model:
-- - Public Read: Anyone can read judgments (authenticated or not)
-- - Authenticated Write: Only authenticated users can insert/update judgments
-- - Service Role: Full access for backend operations
-- =============================================================================

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.judgments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- DROP EXISTING POLICIES (if any)
-- =============================================================================

-- Drop policies if they exist to allow re-running this migration
DROP POLICY IF EXISTS "Public read access for judgments" ON public.judgments;
DROP POLICY IF EXISTS "Authenticated users can insert judgments" ON public.judgments;
DROP POLICY IF EXISTS "Authenticated users can update judgments" ON public.judgments;
DROP POLICY IF EXISTS "Service role has full access" ON public.judgments;

-- =============================================================================
-- CREATE RLS POLICIES
-- =============================================================================

-- Policy 1: Public Read Access
-- Allow anyone (authenticated or not) to read judgments
-- This is appropriate for a public legal research platform
CREATE POLICY "Public read access for judgments"
ON public.judgments
FOR SELECT
USING (true);

-- Policy 2: Authenticated Insert
-- Only authenticated users can create new judgments
-- This prevents spam and ensures accountability
CREATE POLICY "Authenticated users can insert judgments"
ON public.judgments
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy 3: Authenticated Update
-- Only authenticated users can update judgments
-- Additional check: users can only update records they created (if user_id is tracked)
-- For now, allow any authenticated user to update (can be refined later)
CREATE POLICY "Authenticated users can update judgments"
ON public.judgments
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 4: Service Role Full Access
-- Backend service role has unrestricted access for ingestion and maintenance
-- This allows the backend to perform bulk operations and administrative tasks
CREATE POLICY "Service role has full access"
ON public.judgments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant usage on schema to authenticated and anon roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table permissions
-- Anonymous users: SELECT only (covered by RLS policy)
GRANT SELECT ON public.judgments TO anon;

-- Authenticated users: SELECT, INSERT, UPDATE
GRANT SELECT, INSERT, UPDATE ON public.judgments TO authenticated;

-- Service role: ALL privileges
GRANT ALL ON public.judgments TO service_role;

-- Grant permissions on sequences (for UUID generation)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- =============================================================================
-- ENABLE RLS FOR SUPPORTING FUNCTIONS
-- =============================================================================

-- Note: RLS policies automatically apply to direct table access.
-- Functions inherit the security context of the caller.
-- Our search functions (search_judgments_by_embedding, search_judgments_by_text,
-- search_judgments_hybrid) run with the caller's permissions, so RLS policies
-- will apply automatically.

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY "Public read access for judgments" ON public.judgments IS
    'Allows anyone to read judgments - suitable for public legal research platform';

COMMENT ON POLICY "Authenticated users can insert judgments" ON public.judgments IS
    'Only authenticated users can create new judgment records';

COMMENT ON POLICY "Authenticated users can update judgments" ON public.judgments IS
    'Only authenticated users can update judgment records';

COMMENT ON POLICY "Service role has full access" ON public.judgments IS
    'Backend service role has unrestricted access for administrative operations';

-- =============================================================================
-- VERIFY RLS IS ENABLED
-- =============================================================================

DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'judgments') THEN
        RAISE EXCEPTION 'Row Level Security is NOT enabled on judgments table!';
    END IF;
    RAISE NOTICE 'Row Level Security successfully enabled on judgments table';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

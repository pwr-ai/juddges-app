-- =============================================================================
-- Migration: collection_pairs — a PL/UK pair of collections (Spec C, Task 3)
-- =============================================================================
-- A pair has its own identity so it can carry the filter that produced it
-- (permalink, re-run) and cascade when either side is deleted. A collection
-- belongs to at most one pair (UNIQUE on each side). RLS mirrors collections;
-- the backend uses service_role and bypasses it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collection_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    text_query TEXT,
    pl_collection_id UUID NOT NULL UNIQUE REFERENCES public.collections(id) ON DELETE CASCADE,
    uk_collection_id UUID NOT NULL UNIQUE REFERENCES public.collections(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT collection_pairs_distinct_sides CHECK (pl_collection_id <> uk_collection_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_pairs_user_created
    ON public.collection_pairs(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_collection_pairs_set_updated_at ON public.collection_pairs;
CREATE TRIGGER trg_collection_pairs_set_updated_at
    BEFORE UPDATE ON public.collection_pairs
    FOR EACH ROW EXECUTE FUNCTION public.tg_collections_set_updated_at();

ALTER TABLE public.collection_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collection_pairs_owner_select ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_select ON public.collection_pairs
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_insert ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_insert ON public.collection_pairs
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_update ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_update ON public.collection_pairs
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS collection_pairs_owner_delete ON public.collection_pairs;
CREATE POLICY collection_pairs_owner_delete ON public.collection_pairs
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_pairs TO authenticated;
GRANT ALL ON public.collection_pairs TO service_role;

COMMENT ON TABLE public.collection_pairs IS
    'PL/UK pair of collections created from one base-schema filter on /compare. `filters`/`text_query` reproduce the comparison.';

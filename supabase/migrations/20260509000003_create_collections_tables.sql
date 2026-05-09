-- Creates user-owned collections plus the `collection_judgments` join table.
-- Names align with the canonical `judgments` table; the join uses TEXT for
-- judgment_id because callers pass source-formatted identifiers (not UUIDs).

CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_user_created
    ON public.collections(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.collection_judgments (
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    judgment_id   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, judgment_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_judgments_collection_created
    ON public.collection_judgments(collection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_judgments_judgment_id
    ON public.collection_judgments(judgment_id);

-- updated_at trigger for collections
CREATE OR REPLACE FUNCTION public.tg_collections_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collections_set_updated_at ON public.collections;
CREATE TRIGGER trg_collections_set_updated_at
    BEFORE UPDATE ON public.collections
    FOR EACH ROW EXECUTE FUNCTION public.tg_collections_set_updated_at();

-- RLS: backend uses service_role (bypasses), so this only governs anon/authenticated.
ALTER TABLE public.collections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_judgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY collections_owner_select ON public.collections
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY collections_owner_insert ON public.collections
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY collections_owner_update ON public.collections
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY collections_owner_delete ON public.collections
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY collection_judgments_owner_all ON public.collection_judgments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_judgments.collection_id AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.collections c
            WHERE c.id = collection_judgments.collection_id AND c.user_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_judgments TO authenticated;

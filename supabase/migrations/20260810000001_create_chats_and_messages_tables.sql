-- Creates the `chats` and `messages` tables backing the `/chat` surface.
-- Neither table had ever been created, so every chat list, message write, fork
-- and export silently failed. Columns are derived from the real call sites; the
-- primary keys are supplied by the client (`crypto.randomUUID()`), so the
-- defaults below are a convenience only and explicit ids must be accepted.

CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches the list query: filter on user_id, order by updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_chats_user_updated
    ON public.chats(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Deliberately permissive: writers only send 'user'/'assistant' today, but a
    -- tighter constraint would turn a future 'system' turn into a failed insert.
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    -- JSONB so the fork route can select the value and re-insert it unchanged.
    document_ids JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matches the transcript read: filter on chat_id, order by created_at ASC.
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
    ON public.messages(chat_id, created_at);
-- Every message read also filters on user_id.
CREATE INDEX IF NOT EXISTS idx_messages_user_id
    ON public.messages(user_id);

-- updated_at trigger for chats (messages have no updated_at column)
CREATE OR REPLACE FUNCTION public.tg_chats_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chats_set_updated_at ON public.chats;
CREATE TRIGGER trg_chats_set_updated_at
    BEFORE UPDATE ON public.chats
    FOR EACH ROW EXECUTE FUNCTION public.tg_chats_set_updated_at();

-- RLS: unlike collections, message writes come from the *browser* Supabase
-- client with the end user's JWT (frontend/hooks/useChatLogic.ts), so these
-- policies are the actual authorization boundary, not a defensive extra.
ALTER TABLE public.chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chats_owner_select ON public.chats;
CREATE POLICY chats_owner_select ON public.chats
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS chats_owner_insert ON public.chats;
CREATE POLICY chats_owner_insert ON public.chats
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS chats_owner_update ON public.chats;
CREATE POLICY chats_owner_update ON public.chats
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS chats_owner_delete ON public.chats;
CREATE POLICY chats_owner_delete ON public.chats
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS messages_owner_select ON public.messages;
CREATE POLICY messages_owner_select ON public.messages
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS messages_owner_insert ON public.messages;
CREATE POLICY messages_owner_insert ON public.messages
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS messages_owner_update ON public.messages;
CREATE POLICY messages_owner_update ON public.messages
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS messages_owner_delete ON public.messages;
CREATE POLICY messages_owner_delete ON public.messages
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

COMMENT ON TABLE public.chats IS
    'User-owned chat conversations backing the /chat surface. Client supplies id. '
    'Writes arrive from the browser Supabase client with the end user''s JWT, so the '
    'owner-scoped RLS policies on this table are the authorization boundary.';
COMMENT ON TABLE public.messages IS
    'Individual turns of a /chat conversation, cascade-deleted with the parent chat. '
    'Client supplies id. Writes arrive from the browser Supabase client with the end '
    'user''s JWT, so the owner-scoped RLS policies here are the authorization boundary.';

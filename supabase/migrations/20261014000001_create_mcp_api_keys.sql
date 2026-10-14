-- Long-lived per-user MCP API keys (juddges-mcp phase 0).
--
-- Only the sha256 hash of a key is stored; the plaintext is shown once at
-- creation. Revocation sets revoked_at rather than deleting the row, so a
-- leaked-key investigation still has the audit trail.

CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    prefix        TEXT NOT NULL,
    name          TEXT,
    scopes        TEXT[] NOT NULL DEFAULT '{search:read}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_user_id_idx
    ON public.mcp_api_keys (user_id);

COMMENT ON TABLE public.mcp_api_keys IS
    'Long-lived MCP bearer keys. Service-role only: never exposed to anon or '
    'authenticated roles, because holding the anon key must not reveal or '
    'consume a credential. The frontend reads these only through the '
    'backend /mcp/keys endpoints.';

COMMENT ON COLUMN public.mcp_api_keys.token_hash IS
    'sha256 hex of the full plaintext key. The plaintext is never stored.';

ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS with zero policies denies anon and authenticated. The explicit REVOKE
-- is belt-and-braces: a later blanket GRANT in another migration would
-- otherwise silently widen access. See
-- 20260902000001_create_invite_codes.sql for the same reasoning, including
-- why PUBLIC must be revoked separately from anon/authenticated.
REVOKE ALL ON public.mcp_api_keys FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.mcp_api_keys TO service_role;

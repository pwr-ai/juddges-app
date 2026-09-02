-- Invite codes gating pilot self-registration (#573).
--
-- Redemption is a single UPDATE guarded by its own WHERE clause so two
-- concurrent redemptions of a one-use code cannot both succeed.

CREATE TABLE IF NOT EXISTS public.invite_codes (
    code        TEXT PRIMARY KEY,
    note        TEXT,
    max_uses    INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    used_count  INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invite_codes IS
    'Pilot registration gate. Service-role only: never exposed to anon or '
    'authenticated roles, because holding the anon key must not reveal or '
    'consume a code.';

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- RLS with zero policies denies anon and authenticated. The explicit REVOKE
-- is belt-and-braces: a later blanket GRANT in another migration would
-- otherwise silently widen access.
REVOKE ALL ON public.invite_codes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.invite_codes
       SET used_count = used_count + 1
     WHERE code = p_code
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > now());

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated = 1;
END;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default on function creation, which
-- REVOKE ... FROM anon, authenticated does not touch (PUBLIC is a separate
-- grantee). Without also revoking from PUBLIC, anon could call this RPC
-- directly through PostgREST (/rest/v1/rpc/redeem_invite_code) with the
-- public anon key and brute-force codes, bypassing the backend's rate limit
-- entirely — see 20260623000001_lock_down_security_definer_rpcs.sql for the
-- same gotcha on other SECURITY DEFINER RPCs in this project.
REVOKE ALL ON FUNCTION public.redeem_invite_code(TEXT) FROM PUBLIC, anon, authenticated;

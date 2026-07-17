-- Server-authoritative auth events emitted from auth.users triggers.
--
-- auth_signed_up / auth_signed_in are DB-trigger-only: the backend API rejects
-- them from all external callers, so these rows can only originate here.
--
-- Triggers on auth.users are the classic Supabase handle_new_user pattern and
-- work when applied via migrations (postgres role), but they couple to auth
-- schema internals — a Supabase Auth upgrade could change last_sign_in_at
-- write semantics. Mitigations: the EXCEPTION handler below guarantees the
-- auth flow can never break on an analytics failure; the fallback, should a
-- future environment forbid these triggers, is emitting from a Supabase Auth
-- Hook or the frontend auth-callback route via the backend emit_app_event
-- helper (taxonomy and table need no change).
--
-- SECURITY DEFINER: the functions run as their owner (postgres, who owns
-- app_events) because the firing role is supabase_auth_admin, which has no
-- grants on app_events. No PII: only NEW.id is recorded, never email.

CREATE OR REPLACE FUNCTION public.app_events_on_auth_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.app_events (event_name, user_id, surface, properties)
    VALUES ('auth_signed_up', NEW.id, 'api', '{}'::jsonb);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Analytics must never break signup.
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_events_on_auth_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.app_events (event_name, user_id, surface, properties)
    VALUES ('auth_signed_in', NEW.id, 'api', '{}'::jsonb);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Analytics must never break signin.
    RETURN NEW;
END;
$$;

-- Lockdown (20260623000001 style): trigger execution needs no EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.app_events_on_auth_signup()
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.app_events_on_auth_signin()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_app_event ON auth.users;
CREATE TRIGGER on_auth_user_created_app_event
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.app_events_on_auth_signup();

DROP TRIGGER IF EXISTS on_auth_user_signin_app_event ON auth.users;
CREATE TRIGGER on_auth_user_signin_app_event
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at
          AND NEW.last_sign_in_at IS NOT NULL)
    EXECUTE FUNCTION public.app_events_on_auth_signin();

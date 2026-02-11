-- =============================================================================
-- Migration: Verify Auth Schema and Add User Metadata
-- =============================================================================
-- Supabase automatically manages the `auth` schema with tables for:
-- - auth.users: User accounts
-- - auth.sessions: Active sessions
-- - auth.refresh_tokens: Token management
-- - auth.identities: OAuth provider identities
--
-- This migration:
-- 1. Verifies that the auth schema exists
-- 2. Creates a public.profiles table to store additional user metadata
-- 3. Sets up triggers to auto-create profiles when users sign up
-- =============================================================================

-- =============================================================================
-- VERIFY AUTH SCHEMA EXISTS
-- =============================================================================

DO $$
BEGIN
    -- Check if auth schema exists
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        RAISE EXCEPTION 'Auth schema does not exist! Please initialize Supabase Auth.';
    END IF;

    -- Check if core auth tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'auth' AND table_name = 'users') THEN
        RAISE EXCEPTION 'Auth users table does not exist! Please initialize Supabase Auth.';
    END IF;

    RAISE NOTICE 'Auth schema verification passed ✓';
END $$;

-- =============================================================================
-- CREATE USER PROFILES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    -- Link to auth.users
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- User information
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,

    -- User role and permissions
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'researcher')),

    -- Organization (for enterprise users)
    organization TEXT,
    department TEXT,

    -- Preferences
    preferences JSONB DEFAULT '{
        "language": "en",
        "theme": "light",
        "notifications_enabled": true,
        "default_jurisdiction": null,
        "search_history_enabled": true
    }'::jsonb,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ENABLE RLS ON PROFILES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Service role has full access
CREATE POLICY "Service role has full access to profiles"
ON public.profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at DESC);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update updated_at timestamp
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.profiles IS
    'User profiles with additional metadata beyond auth.users. Automatically created on signup.';

COMMENT ON COLUMN public.profiles.role IS
    'User role: user (default), admin (full access), researcher (advanced features)';

COMMENT ON COLUMN public.profiles.preferences IS
    'User preferences stored as JSON (language, theme, search settings, etc.)';

COMMENT ON FUNCTION public.handle_new_user() IS
    'Automatically creates a profile record when a new user signs up via Supabase Auth';

-- =============================================================================
-- HELPER FUNCTIONS FOR AUTH
-- =============================================================================

-- Function to get the current user's profile
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_my_profile() IS
    'Returns the current authenticated user profile';

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.is_admin() IS
    'Returns true if the current user has admin role';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    -- Verify profiles table was created
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        RAISE EXCEPTION 'Failed to create profiles table!';
    END IF;

    -- Verify RLS is enabled
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles') THEN
        RAISE EXCEPTION 'Row Level Security is NOT enabled on profiles table!';
    END IF;

    RAISE NOTICE 'Auth schema and profiles setup complete ✓';
END $$;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

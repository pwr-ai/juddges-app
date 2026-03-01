-- =============================================================================
-- Migration: Create contact_submissions table for contact form pipeline
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
    email TEXT NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
    company TEXT NOT NULL CHECK (char_length(company) BETWEEN 2 AND 160),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
    source TEXT NOT NULL DEFAULT 'website',
    ip_address TEXT,
    user_agent TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_submitted_at
    ON public.contact_submissions (submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_email
    ON public.contact_submissions (email);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow contact submission inserts" ON public.contact_submissions;
DROP POLICY IF EXISTS "Service role full access for contact submissions" ON public.contact_submissions;

CREATE POLICY "Allow contact submission inserts"
ON public.contact_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Service role full access for contact submissions"
ON public.contact_submissions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT INSERT ON public.contact_submissions TO anon, authenticated;
GRANT ALL ON public.contact_submissions TO service_role;

COMMENT ON TABLE public.contact_submissions IS
    'Inbound contact form submissions from marketing and support forms.';

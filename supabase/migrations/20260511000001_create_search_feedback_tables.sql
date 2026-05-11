-- =============================================================================
-- Migration: Create search_feedback and feature_requests tables.
-- =============================================================================
-- Backend code (backend/app/feedback.py) and the frontend
-- SearchResultFeedback component have always referenced these tables, but the
-- migration was never written, so every feedback submission failed with
-- PGRST205 ("Could not find the table 'public.search_feedback' in the schema
-- cache"). This migration creates both tables with the schema documented in
-- backend/app/feedback.py:197-291.
--
-- Access model (matches feedback router behavior):
--   * Anonymous AND authenticated users may INSERT (the /api/feedback/search
--     and /api/feedback/feature endpoints use get_optional_user).
--   * Authenticated users may SELECT their own rows; service role has full
--     access for analytics, retention export, and admin tooling.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. public.search_feedback — relevance ratings on search results
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_feedback (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT        NOT NULL,
    search_query    TEXT        NOT NULL,
    rating          TEXT        NOT NULL
        CHECK (rating IN ('relevant', 'not_relevant', 'somewhat_relevant')),
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id      TEXT,
    result_position INT         CHECK (result_position IS NULL OR result_position >= 1),
    reason          TEXT        CHECK (reason IS NULL OR char_length(reason) <= 500),
    search_context  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_search_feedback_document_id
    ON public.search_feedback (document_id);
CREATE INDEX IF NOT EXISTS idx_search_feedback_search_query
    ON public.search_feedback (search_query);
CREATE INDEX IF NOT EXISTS idx_search_feedback_user_id
    ON public.search_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_search_feedback_created_at
    ON public.search_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_feedback_rating
    ON public.search_feedback (rating);

ALTER TABLE public.search_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow search feedback inserts" ON public.search_feedback;
DROP POLICY IF EXISTS "Users read own search feedback" ON public.search_feedback;
DROP POLICY IF EXISTS "Service role full access on search_feedback" ON public.search_feedback;

CREATE POLICY "Allow search feedback inserts"
ON public.search_feedback
FOR INSERT
TO anon, authenticated
WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
);

CREATE POLICY "Users read own search feedback"
ON public.search_feedback
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role full access on search_feedback"
ON public.search_feedback
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT INSERT ON public.search_feedback TO anon, authenticated;
GRANT SELECT ON public.search_feedback TO authenticated;
GRANT ALL    ON public.search_feedback TO service_role;

COMMENT ON TABLE public.search_feedback IS
    'User relevance ratings (thumbs up/down) on search results. Drives evaluation datasets and ranking improvements.';
COMMENT ON COLUMN public.search_feedback.search_context IS
    'Enriched JSONB context: filters, search_params, result_context, document, interaction, chunk_info, chunks. Schema in backend/app/feedback.py.';


-- -----------------------------------------------------------------------------
-- 2. public.feature_requests — bug reports / feature requests / praise
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feature_requests (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_type TEXT        NOT NULL
        CHECK (feedback_type IN ('bug_report', 'feature_request', 'improvement', 'praise')),
    feature_name  TEXT,
    title         TEXT        NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
    description   TEXT        NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
    user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email    TEXT,
    priority      TEXT        NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status        TEXT        NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewed', 'planned', 'in_progress', 'completed', 'closed')),
    attachments   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    upvotes       INT         NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_user_id
    ON public.feature_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status
    ON public.feature_requests (status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_feedback_type
    ON public.feature_requests (feedback_type);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at
    ON public.feature_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_requests_upvotes
    ON public.feature_requests (upvotes DESC);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow feature request inserts" ON public.feature_requests;
DROP POLICY IF EXISTS "Users read own feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Service role full access on feature_requests" ON public.feature_requests;

CREATE POLICY "Allow feature request inserts"
ON public.feature_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
);

CREATE POLICY "Users read own feature requests"
ON public.feature_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role full access on feature_requests"
ON public.feature_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT INSERT ON public.feature_requests TO anon, authenticated;
GRANT SELECT ON public.feature_requests TO authenticated;
GRANT ALL    ON public.feature_requests TO service_role;

COMMENT ON TABLE public.feature_requests IS
    'User-submitted bug reports, feature requests, improvements, and praise. Backed by POST /api/feedback/feature.';


-- -----------------------------------------------------------------------------
-- 3. Keep updated_at in sync on feature_requests
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_feature_requests_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_requests_set_updated_at ON public.feature_requests;
CREATE TRIGGER trg_feature_requests_set_updated_at
BEFORE UPDATE ON public.feature_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_feature_requests_set_updated_at();

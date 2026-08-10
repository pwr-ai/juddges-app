-- Creates the five blog tables that `backend/app/api/blog.py`,
-- `backend/app/api/admin.py` (content stats) and the two public blog RPCs
-- (20260805120000, 20260805150000) are written against but that never existed
-- in the schema: blog_posts, blog_tags, blog_categories, blog_likes,
-- blog_bookmarks. See #451.
--
-- Column names are derived from the RPC bodies (their SELECT lists, filters and
-- the `idx_blog_tags_tag_post_id` index) and from the backend projections
-- (`_BLOG_POST_COLS`, `_BLOG_CATEGORY_COLS`). Length limits mirror the Pydantic
-- models in `backend/app/api/blog.py`. Filename sorts before both RPC
-- migrations so the tables exist by the time the functions are created.
--
-- Author display fields are NOT stored here: `author_id` references
-- `auth.users`, and the RPCs resolve public author fields from
-- `public.profiles`.
--
-- Access posture: every blog endpoint goes through the backend's service-role
-- client (`get_admin_supabase_client`), and the two blog RPCs grant EXECUTE to
-- `service_role` only. RLS is therefore enabled on all five tables and no
-- anon/authenticated grant or policy is issued for the three content tables —
-- they are deny-by-default over PostgREST. `blog_likes` / `blog_bookmarks` hold
-- per-user rows and get owner-scoped policies in the house style
-- (`20260509000003_create_collections_tables.sql`), with `(SELECT auth.uid())`
-- wrapping per the InitPlan optimization in `20260623000002`.

-- =============================================================================
-- blog_posts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 255),
    title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    excerpt        TEXT NOT NULL,
    content        TEXT,
    featured_image TEXT CHECK (featured_image IS NULL OR char_length(featured_image) <= 500),
    author_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    category       TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 100),
    status         TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'scheduled')),
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_time      INTEGER CHECK (read_time IS NULL OR read_time >= 0),
    views          INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    likes_count    INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    ai_summary     TEXT,
    deleted_at     TIMESTAMPTZ
);

-- Slugs are the public lookup key; uniqueness is scoped to live rows because
-- deletes are soft (`ensure_unique_slug` excludes soft-deleted posts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug_live
    ON public.blog_posts(slug)
    WHERE deleted_at IS NULL;

-- Public listing: status/deleted_at filter, ordered by published_at.
CREATE INDEX IF NOT EXISTS idx_blog_posts_published
    ON public.blog_posts(status, published_at DESC)
    WHERE deleted_at IS NULL;

-- Category filter and the detail RPC's related-posts lookup.
CREATE INDEX IF NOT EXISTS idx_blog_posts_category_published
    ON public.blog_posts(category, published_at DESC)
    WHERE deleted_at IS NULL AND status = 'published';

-- Admin listing for non-platform-admin authors.
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_updated
    ON public.blog_posts(author_id, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_blog_posts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Column-scoped on purpose: `views` and `likes_count` are counters, and a like
-- or a page view must not reorder the admin list, which sorts on updated_at.
DROP TRIGGER IF EXISTS trg_blog_posts_set_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_set_updated_at
    BEFORE UPDATE OF slug, title, excerpt, content, featured_image, author_id,
        category, status, published_at, read_time, ai_summary, deleted_at
    ON public.blog_posts
    FOR EACH ROW EXECUTE FUNCTION public.tg_blog_posts_set_updated_at();

-- =============================================================================
-- blog_tags — one row per (post, tag); the RPCs aggregate `tag` per `post_id`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_tags (
    post_id    UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
    tag        TEXT NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, tag)
);

-- `idx_blog_tags_tag_post_id` (tag -> post lookups for the ?tag= filter) is
-- created by 20260805120000; the primary key covers the post -> tags direction.

-- =============================================================================
-- blog_categories — `blog_posts.category` stores the category *name*, matching
-- `list_categories()` which counts posts with `category = blog_categories.name`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- blog_likes — one like per (post, user). `id` exists because the like toggle
-- deletes by primary key.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_likes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_likes_user_created
    ON public.blog_likes(user_id, created_at DESC);

-- `blog_posts.likes_count` is the value the like toggle reads back and the
-- listing RPC sorts on, so it is maintained from `blog_likes` rather than by
-- the application. SECURITY DEFINER because `authenticated` may insert/delete
-- its own like rows but must never hold UPDATE on blog_posts; search_path is
-- pinned per the hardening in 20260623000001. The function touches nothing but
-- the counter of the post the like row points at.
CREATE OR REPLACE FUNCTION public.tg_blog_likes_sync_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.blog_posts
        SET likes_count = likes_count + 1
        WHERE id = NEW.post_id;
        RETURN NEW;
    ELSE
        UPDATE public.blog_posts
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_likes_sync_count ON public.blog_likes;
CREATE TRIGGER trg_blog_likes_sync_count
    AFTER INSERT OR DELETE ON public.blog_likes
    FOR EACH ROW EXECUTE FUNCTION public.tg_blog_likes_sync_count();

-- =============================================================================
-- blog_bookmarks — same shape as blog_likes; the bookmarks endpoint embeds
-- `blog_posts` through the foreign key and returns `created_at` as
-- `bookmarked_at`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_bookmarks (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_bookmarks_user_created
    ON public.blog_bookmarks(user_id, created_at DESC);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.blog_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_likes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_bookmarks  ENABLE ROW LEVEL SECURITY;

-- blog_posts / blog_tags / blog_categories: intentionally no anon or
-- authenticated policy or grant. Public reads are served by the backend through
-- the service-role client (which bypasses RLS), matching the service_role-only
-- EXECUTE grants on `list_public_blog_posts` and `get_public_blog_post`.

DROP POLICY IF EXISTS blog_likes_owner_select ON public.blog_likes;
CREATE POLICY blog_likes_owner_select ON public.blog_likes
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blog_likes_owner_insert ON public.blog_likes;
CREATE POLICY blog_likes_owner_insert ON public.blog_likes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blog_likes_owner_delete ON public.blog_likes;
CREATE POLICY blog_likes_owner_delete ON public.blog_likes
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blog_bookmarks_owner_select ON public.blog_bookmarks;
CREATE POLICY blog_bookmarks_owner_select ON public.blog_bookmarks
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blog_bookmarks_owner_insert ON public.blog_bookmarks;
CREATE POLICY blog_bookmarks_owner_insert ON public.blog_bookmarks
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS blog_bookmarks_owner_delete ON public.blog_bookmarks;
CREATE POLICY blog_bookmarks_owner_delete ON public.blog_bookmarks
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, DELETE ON public.blog_likes     TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.blog_bookmarks TO authenticated;

GRANT ALL ON public.blog_posts      TO service_role;
GRANT ALL ON public.blog_tags       TO service_role;
GRANT ALL ON public.blog_categories TO service_role;
GRANT ALL ON public.blog_likes      TO service_role;
GRANT ALL ON public.blog_bookmarks  TO service_role;

-- =============================================================================
-- Documentation
-- =============================================================================

COMMENT ON TABLE public.blog_posts IS
    'Blog articles. Soft-deleted via deleted_at; public reads require status = ''published''.';
COMMENT ON COLUMN public.blog_posts.author_id IS
    'auth.users id; public author display fields are resolved from public.profiles by the blog RPCs.';
COMMENT ON COLUMN public.blog_posts.likes_count IS
    'Denormalized count of public.blog_likes rows, maintained by trg_blog_likes_sync_count.';
COMMENT ON TABLE public.blog_tags IS
    'Free-form tags per blog post; aggregated into the tags array by the blog RPCs.';
COMMENT ON TABLE public.blog_categories IS
    'Category catalogue. blog_posts.category matches blog_categories.name.';
COMMENT ON TABLE public.blog_likes IS
    'Per-user post likes. Owner-scoped under RLS.';
COMMENT ON TABLE public.blog_bookmarks IS
    'Per-user post bookmarks. Owner-scoped under RLS.';

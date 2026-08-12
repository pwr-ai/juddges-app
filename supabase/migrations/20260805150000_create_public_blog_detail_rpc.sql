-- Resolve one public blog article and its related cards in a single bounded
-- statement. Only published, non-deleted rows and allowlisted profile fields
-- leave the database boundary.

CREATE OR REPLACE FUNCTION public.get_public_blog_post(
    p_slug text,
    p_related_limit integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH target AS MATERIALIZED (
        SELECT bp.*
        FROM public.blog_posts AS bp
        WHERE bp.slug = p_slug
          AND bp.status = 'published'
          AND bp.deleted_at IS NULL
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'title', t.title,
        'excerpt', t.excerpt,
        'content', t.content,
        'featured_image', t.featured_image,
        'author', CASE
            WHEN up.id IS NULL THEN jsonb_build_object(
                'id', t.author_id,
                'name', 'Anonymous',
                'avatar', NULL,
                'title', 'Researcher'
            )
            ELSE jsonb_build_object(
                'id', up.id,
                'name', COALESCE(up.full_name, 'Anonymous'),
                'avatar', up.avatar_url,
                -- public.profiles has no job-title column; the API layer
                -- substitutes its own default for a null here.
                'title', NULL::text
            )
        END,
        'category', t.category,
        'tags', COALESCE(
            (
                SELECT jsonb_agg(bt.tag ORDER BY bt.tag)
                FROM public.blog_tags AS bt
                WHERE bt.post_id = t.id
            ),
            '[]'::jsonb
        ),
        'status', t.status,
        'published_at', t.published_at,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'read_time', t.read_time,
        'views', COALESCE(t.views, 0),
        'likes_count', COALESCE(t.likes_count, 0),
        'ai_summary', t.ai_summary,
        'related_posts', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', related.id,
                        'slug', related.slug,
                        'title', related.title,
                        'excerpt', related.excerpt,
                        'featured_image', related.featured_image,
                        'author', CASE
                            WHEN related_author.id IS NULL THEN jsonb_build_object(
                                'id', related.author_id,
                                'name', 'Anonymous',
                                'avatar', NULL,
                                'title', 'Researcher'
                            )
                            ELSE jsonb_build_object(
                                'id', related_author.id,
                                'name', COALESCE(related_author.full_name, 'Anonymous'),
                                'avatar', related_author.avatar_url,
                                'title', NULL::text
                            )
                        END,
                        'category', related.category,
                        'tags', COALESCE(
                            (
                                SELECT jsonb_agg(related_tag.tag ORDER BY related_tag.tag)
                                FROM public.blog_tags AS related_tag
                                WHERE related_tag.post_id = related.id
                            ),
                            '[]'::jsonb
                        ),
                        'status', related.status,
                        'published_at', related.published_at,
                        'created_at', related.created_at,
                        'updated_at', related.updated_at,
                        'read_time', related.read_time,
                        'views', COALESCE(related.views, 0),
                        'likes_count', COALESCE(related.likes_count, 0),
                        'ai_summary', related.ai_summary
                    )
                    ORDER BY related.published_at DESC NULLS LAST, related.id ASC
                )
                FROM (
                    SELECT candidate.*
                    FROM public.blog_posts AS candidate
                    WHERE candidate.category = t.category
                      AND candidate.id <> t.id
                      AND candidate.status = 'published'
                      AND candidate.deleted_at IS NULL
                    ORDER BY candidate.published_at DESC NULLS LAST, candidate.id ASC
                    LIMIT LEAST(GREATEST(p_related_limit, 0), 6)
                ) AS related
                LEFT JOIN public.profiles AS related_author
                    ON related_author.id = related.author_id
            ),
            '[]'::jsonb
        )
    )
    FROM target AS t
    LEFT JOIN public.profiles AS up ON up.id = t.author_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_blog_post(text, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_blog_post(text, integer)
TO service_role;

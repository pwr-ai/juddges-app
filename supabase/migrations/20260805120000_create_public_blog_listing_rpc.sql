-- One bounded query for the public blog index. Filters stay SQL parameters,
-- related data is aggregated in-database, and only public author fields leave
-- the database boundary.

CREATE INDEX IF NOT EXISTS idx_blog_tags_tag_post_id
    ON public.blog_tags (tag, post_id);

CREATE OR REPLACE FUNCTION public.list_public_blog_posts(
    p_page integer DEFAULT 1,
    p_limit integer DEFAULT 10,
    p_category text DEFAULT NULL,
    p_tag text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_sort text DEFAULT 'published_at',
    p_order text DEFAULT 'desc'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH input AS (
        SELECT
            GREATEST(p_page, 1) AS page_number,
            LEAST(GREATEST(p_limit, 1), 50) AS page_size,
            NULLIF(BTRIM(p_search), '') AS search_value,
            REPLACE(
                REPLACE(
                    REPLACE(NULLIF(BTRIM(p_search), ''), E'\\', E'\\\\'),
                    '%',
                    E'\\%'
                ),
                '_',
                E'\\_'
            ) AS escaped_search
    ),
    filtered AS MATERIALIZED (
        SELECT
            bp.id,
            bp.slug,
            bp.title,
            bp.excerpt,
            bp.featured_image,
            bp.author_id,
            bp.category,
            bp.status,
            bp.published_at,
            bp.created_at,
            bp.updated_at,
            bp.read_time,
            bp.views,
            bp.likes_count,
            bp.ai_summary
        FROM public.blog_posts AS bp
        CROSS JOIN input AS i
        WHERE bp.status = 'published'
          AND bp.deleted_at IS NULL
          AND (p_category IS NULL OR bp.category = p_category)
          AND (
              i.search_value IS NULL
              OR bp.title ILIKE ('%' || i.escaped_search || '%') ESCAPE E'\\'
              OR bp.excerpt ILIKE ('%' || i.escaped_search || '%') ESCAPE E'\\'
          )
          AND (
              p_tag IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public.blog_tags AS filter_tag
                  WHERE filter_tag.post_id = bp.id
                    AND filter_tag.tag = p_tag
              )
          )
    ),
    ranked AS (
        SELECT
            f.*,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN p_order = 'asc' AND p_sort = 'published_at' THEN f.published_at END ASC NULLS LAST,
                    CASE WHEN p_order = 'desc' AND p_sort = 'published_at' THEN f.published_at END DESC NULLS LAST,
                    CASE WHEN p_order = 'asc' AND p_sort = 'created_at' THEN f.created_at END ASC NULLS LAST,
                    CASE WHEN p_order = 'desc' AND p_sort = 'created_at' THEN f.created_at END DESC NULLS LAST,
                    CASE WHEN p_order = 'asc' AND p_sort = 'views' THEN f.views END ASC NULLS LAST,
                    CASE WHEN p_order = 'desc' AND p_sort = 'views' THEN f.views END DESC NULLS LAST,
                    CASE WHEN p_order = 'asc' AND p_sort = 'likes_count' THEN f.likes_count END ASC NULLS LAST,
                    CASE WHEN p_order = 'desc' AND p_sort = 'likes_count' THEN f.likes_count END DESC NULLS LAST,
                    f.id ASC
            ) AS ordinal
        FROM filtered AS f
    ),
    paged AS (
        SELECT r.*
        FROM ranked AS r
        CROSS JOIN input AS i
        WHERE r.ordinal > ((i.page_number - 1) * i.page_size)
          AND r.ordinal <= (i.page_number * i.page_size)
    ),
    enriched AS (
        SELECT
            p.*,
            CASE
                WHEN up.id IS NULL THEN jsonb_build_object(
                    'id', p.author_id,
                    'name', 'Anonymous',
                    'avatar', NULL,
                    'title', 'Researcher'
                )
                ELSE jsonb_build_object(
                    'id', up.id,
                    'name', COALESCE(up.name, 'Anonymous'),
                    'avatar', up.avatar,
                    'title', COALESCE(up.title, 'Researcher')
                )
            END AS author,
            COALESCE(
                (
                    SELECT jsonb_agg(post_tag.tag ORDER BY post_tag.tag)
                    FROM public.blog_tags AS post_tag
                    WHERE post_tag.post_id = p.id
                ),
                '[]'::jsonb
            ) AS tags
        FROM paged AS p
        LEFT JOIN public.user_profiles AS up ON up.id = p.author_id
    )
    SELECT jsonb_build_object(
        'total', (SELECT COUNT(*) FROM filtered),
        'data', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', e.id,
                        'slug', e.slug,
                        'title', e.title,
                        'excerpt', e.excerpt,
                        'featured_image', e.featured_image,
                        'author', e.author,
                        'category', e.category,
                        'tags', e.tags,
                        'status', e.status,
                        'published_at', e.published_at,
                        'created_at', e.created_at,
                        'updated_at', e.updated_at,
                        'read_time', e.read_time,
                        'views', COALESCE(e.views, 0),
                        'likes_count', COALESCE(e.likes_count, 0),
                        'ai_summary', e.ai_summary
                    )
                    ORDER BY e.ordinal
                )
                FROM enriched AS e
            ),
            '[]'::jsonb
        )
    );
$$;

REVOKE ALL ON FUNCTION public.list_public_blog_posts(
    integer, integer, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_public_blog_posts(
    integer, integer, text, text, text, text, text
) TO service_role;

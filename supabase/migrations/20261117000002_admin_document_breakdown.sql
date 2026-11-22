-- Admin document stats: country / language breakdown over the WHOLE judgments
-- table. The backend used to select every row through PostgREST, which caps a
-- response at 1000 rows, so the breakdown reflected only the first 1000 rows.
--
-- Backend-only RPC: SECURITY DEFINER with an empty search_path, executable by
-- service_role only (same posture as get_trending_topics).

CREATE OR REPLACE FUNCTION public.get_admin_document_breakdown()
RETURNS TABLE(dimension text, key text, doc_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '60s'
AS $$
    SELECT 'country'::text, j.jurisdiction::text, count(*)
      FROM public.judgments j
     GROUP BY j.jurisdiction
    UNION ALL
    SELECT 'language'::text, j.metadata ->> 'language', count(*)
      FROM public.judgments j
     GROUP BY j.metadata ->> 'language';
$$;

REVOKE ALL ON FUNCTION public.get_admin_document_breakdown()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_document_breakdown()
    TO service_role;

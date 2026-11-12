-- =============================================================================
-- get_unchunked_judgments: next batch of judgments without document_chunks
-- =============================================================================
-- Replaces client-side paging of every document_chunks row (to build an id
-- set) and the per-batch rescan of judgments from offset 0. The anti-join is
-- an index probe on idx_document_chunks_document_id per candidate judgment,
-- and keyset pagination on (created_at, id) keeps per-batch cost independent
-- of how many judgments are already chunked. NULL created_at sorts first via
-- the '-infinity' coalesce so the cursor is total-ordered.
-- Returns at most p_limit rows, so PostgREST's 1000-row cap is not hit for
-- the chunker's batch sizes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_unchunked_judgments(
    p_limit integer DEFAULT 50,
    p_after_created_at timestamptz DEFAULT NULL,
    p_after_id uuid DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    case_number text,
    jurisdiction text,
    full_text text,
    sort_created_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT j.id,
           j.case_number,
           j.jurisdiction::text,
           j.full_text,
           COALESCE(j.created_at, '-infinity'::timestamptz) AS sort_created_at
    FROM public.judgments j
    WHERE NOT EXISTS (
              SELECT 1 FROM public.document_chunks c WHERE c.document_id = j.id
          )
      AND (
              p_after_created_at IS NULL
              OR (COALESCE(j.created_at, '-infinity'::timestamptz), j.id)
                 > (p_after_created_at, p_after_id)
          )
    ORDER BY COALESCE(j.created_at, '-infinity'::timestamptz), j.id
    LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_unchunked_judgments(integer, timestamptz, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unchunked_judgments(integer, timestamptz, uuid)
    TO service_role;

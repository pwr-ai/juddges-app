-- Per-user search history aggregate.
-- Returns raw events (not deduplicated) so the caller can render a
-- chronological history view; deduplication can happen client-side.
--
-- SECURITY DEFINER + explicit p_user_id filter: callers (FastAPI) MUST pass
-- the authenticated user's id. The endpoint is responsible for that mapping;
-- this function only filters by the argument it was given.

CREATE OR REPLACE FUNCTION get_user_search_history(
    p_user_id UUID,
    days_back INT DEFAULT 30,
    max_results INT DEFAULT 100
)
RETURNS TABLE(
    query            TEXT,
    hit_count        INT,
    topic_hits_count INT,
    processing_ms    INT,
    filters          TEXT,
    created_at       TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.query,
        sa.hit_count,
        sa.topic_hits_count,
        sa.processing_ms,
        sa.filters,
        sa.created_at
    FROM search_analytics sa
    WHERE sa.user_id = p_user_id
      AND sa.created_at >= now() - (days_back || ' days')::INTERVAL
    ORDER BY sa.created_at DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

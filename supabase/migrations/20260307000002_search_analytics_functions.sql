-- Aggregate functions for search analytics dashboard.

CREATE OR REPLACE FUNCTION get_popular_search_queries(
    days_back INT DEFAULT 7,
    max_results INT DEFAULT 20
)
RETURNS TABLE(query TEXT, search_count BIGINT, avg_hits NUMERIC, avg_processing_ms NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.query,
        COUNT(*)            AS search_count,
        ROUND(AVG(sa.hit_count), 1)    AS avg_hits,
        ROUND(AVG(sa.processing_ms), 0) AS avg_processing_ms
    FROM search_analytics sa
    WHERE sa.created_at >= now() - (days_back || ' days')::INTERVAL
    GROUP BY sa.query
    ORDER BY search_count DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_zero_result_queries(
    days_back INT DEFAULT 7,
    max_results INT DEFAULT 20
)
RETURNS TABLE(query TEXT, search_count BIGINT, last_searched TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.query,
        COUNT(*)        AS search_count,
        MAX(sa.created_at) AS last_searched
    FROM search_analytics sa
    WHERE sa.created_at >= now() - (days_back || ' days')::INTERVAL
      AND sa.hit_count = 0
    GROUP BY sa.query
    ORDER BY search_count DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

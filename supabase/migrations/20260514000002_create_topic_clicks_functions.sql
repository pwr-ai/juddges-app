-- Aggregate functions for the topic-analytics surface (issue #229).
--
-- Both functions read from search_topic_clicks (created in
-- 20260511000004_create_search_topic_clicks_table.sql).

-- Trending topics: most-clicked topics over a rolling window, with a
-- jurisdiction split so the UI can render cross-lingual (PL vs UK) comparison.
-- A NULL jurisdiction (filter not active when the user clicked) is grouped as
-- 'unknown' so totals always reconcile.
CREATE OR REPLACE FUNCTION get_trending_topics(
    days_back INT DEFAULT 30,
    max_results INT DEFAULT 20
)
RETURNS TABLE(
    topic_id      TEXT,
    click_count   BIGINT,
    pl_count      BIGINT,
    uk_count      BIGINT,
    other_count   BIGINT,
    last_clicked  TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        stc.topic_id,
        COUNT(*)                                                       AS click_count,
        COUNT(*) FILTER (WHERE upper(stc.jurisdiction) = 'PL')         AS pl_count,
        COUNT(*) FILTER (WHERE upper(stc.jurisdiction) = 'UK')         AS uk_count,
        COUNT(*) FILTER (
            WHERE stc.jurisdiction IS NULL
               OR upper(stc.jurisdiction) NOT IN ('PL', 'UK')
        )                                                              AS other_count,
        MAX(stc.created_at)                                            AS last_clicked
    FROM search_topic_clicks stc
    WHERE stc.created_at >= now() - (days_back || ' days')::INTERVAL
    GROUP BY stc.topic_id
    ORDER BY click_count DESC, last_clicked DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Per-user recent topic clicks ("Your topics").
--
-- SECURITY DEFINER + explicit p_user_id filter: callers (FastAPI) MUST pass
-- the authenticated user's id. The endpoint is responsible for that mapping;
-- this function only filters by the argument it was given.
CREATE OR REPLACE FUNCTION get_user_topic_clicks(
    p_user_id UUID,
    days_back INT DEFAULT 30,
    max_results INT DEFAULT 50
)
RETURNS TABLE(
    topic_id      TEXT,
    click_count   BIGINT,
    last_clicked  TIMESTAMPTZ,
    last_query    TEXT,
    jurisdiction  TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        stc.topic_id,
        COUNT(*)                          AS click_count,
        MAX(stc.created_at)               AS last_clicked,
        (ARRAY_AGG(stc.query ORDER BY stc.created_at DESC))[1]        AS last_query,
        (ARRAY_AGG(stc.jurisdiction ORDER BY stc.created_at DESC))[1] AS jurisdiction
    FROM search_topic_clicks stc
    WHERE stc.user_id = p_user_id
      AND stc.created_at >= now() - (days_back || ' days')::INTERVAL
    GROUP BY stc.topic_id
    ORDER BY last_clicked DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

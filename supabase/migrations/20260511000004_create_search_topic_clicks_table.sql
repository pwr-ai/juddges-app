-- Track topic-chip clicks from the autocomplete dropdown.
-- Records which topic concepts users click so click-through rates and popular
-- topics can be surfaced in the admin UI and used for future ranking signals.

CREATE TABLE IF NOT EXISTS search_topic_clicks (
    id           BIGSERIAL PRIMARY KEY,
    user_id      UUID,
    topic_id     TEXT        NOT NULL,
    query        TEXT        NOT NULL,
    jurisdiction TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-topic click aggregation
CREATE INDEX search_topic_clicks_topic_id_idx ON search_topic_clicks (topic_id);

-- Index for time-range queries (trending topics, recent activity)
CREATE INDEX search_topic_clicks_created_at_idx ON search_topic_clicks (created_at DESC);

-- RLS: service role can insert/read, anon cannot (matches search_analytics pattern)
ALTER TABLE search_topic_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on search_topic_clicks"
    ON search_topic_clicks
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

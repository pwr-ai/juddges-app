-- Search analytics table for tracking autocomplete queries.
-- Captures popular queries, zero-result queries, and performance metrics.

CREATE TABLE IF NOT EXISTS search_analytics (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query           TEXT        NOT NULL,
    hit_count       INT         NOT NULL DEFAULT 0,
    processing_ms   INT,
    filters         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for popular-queries aggregation (query text + time range)
CREATE INDEX idx_search_analytics_query ON search_analytics (query);
CREATE INDEX idx_search_analytics_created_at ON search_analytics (created_at);

-- Index for zero-result query discovery
CREATE INDEX idx_search_analytics_zero_hits ON search_analytics (hit_count) WHERE hit_count = 0;

-- RLS: service role can insert/read, anon cannot
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on search_analytics"
    ON search_analytics
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

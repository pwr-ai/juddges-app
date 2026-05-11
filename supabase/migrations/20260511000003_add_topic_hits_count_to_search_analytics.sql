-- Add topic_hits_count to search_analytics.
-- Records the number of topic hits returned alongside document hits
-- when the autocomplete endpoint surfaces results from the topics index.
-- NULL = pre-topics queries (before this column existed).

ALTER TABLE search_analytics
    ADD COLUMN IF NOT EXISTS topic_hits_count INT;

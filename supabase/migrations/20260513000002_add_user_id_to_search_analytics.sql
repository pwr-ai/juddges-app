-- Add user_id to search_analytics so we can attribute queries to the user who
-- ran them. NULL covers anonymous traffic and rows recorded before this
-- migration. We do not FK to auth.users on purpose: keeping analytics readable
-- after a user is deleted is more valuable than referential cleanup.

ALTER TABLE search_analytics
    ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_search_analytics_user_id
    ON search_analytics (user_id)
    WHERE user_id IS NOT NULL;

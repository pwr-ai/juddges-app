-- Persist generated search-topic snapshots in Supabase so Meilisearch can be
-- rebuilt from a durable ground-truth store without re-running BERTopic/LLM
-- generation each time.

CREATE TABLE IF NOT EXISTS search_topics (
    run_id            UUID        NOT NULL,
    id                TEXT        NOT NULL,
    label_pl          TEXT        NOT NULL,
    label_en          TEXT        NOT NULL,
    aliases_pl        TEXT[]      NOT NULL DEFAULT '{}',
    aliases_en        TEXT[]      NOT NULL DEFAULT '{}',
    category          TEXT        NOT NULL,
    doc_count         INTEGER     NOT NULL DEFAULT 0 CHECK (doc_count >= 0),
    jurisdictions     TEXT[]      NOT NULL DEFAULT '{}',
    generated_at      TIMESTAMPTZ NOT NULL,
    corpus_snapshot   INTEGER,
    source_case_type  TEXT        NOT NULL DEFAULT 'criminal',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS search_topics_generated_at_idx
    ON search_topics (generated_at DESC);

CREATE INDEX IF NOT EXISTS search_topics_run_id_idx
    ON search_topics (run_id);

CREATE INDEX IF NOT EXISTS search_topics_id_idx
    ON search_topics (id);

ALTER TABLE search_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on search_topics"
    ON search_topics
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

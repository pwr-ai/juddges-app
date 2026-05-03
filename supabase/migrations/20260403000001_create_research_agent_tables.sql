-- Research Agent: session storage and framework-agnostic checkpoints

CREATE TABLE IF NOT EXISTS research_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users,

    -- Context
    mode            TEXT NOT NULL CHECK (mode IN ('guided', 'exploratory', 'case_preparation')),
    initial_query   TEXT NOT NULL,
    title           TEXT,

    -- Status
    status          TEXT NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'researching', 'awaiting_input', 'completed', 'failed', 'stopped')),
    current_step    TEXT,
    progress        JSONB DEFAULT '{}',

    -- Incremental results
    findings        JSONB DEFAULT '[]'::jsonb,
    used_tools      JSONB DEFAULT '[]'::jsonb,
    decision_points JSONB DEFAULT '[]'::jsonb,

    -- Final report
    report          JSONB,

    -- Framework info
    agent_framework TEXT NOT NULL DEFAULT 'langgraph',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing user sessions
CREATE INDEX IF NOT EXISTS idx_research_sessions_user_status
    ON research_sessions (user_id, status, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_research_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_research_sessions_updated_at
    BEFORE UPDATE ON research_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_research_sessions_updated_at();

-- RLS
ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research sessions"
    ON research_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own research sessions"
    ON research_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own research sessions"
    ON research_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role bypass for backend
CREATE POLICY "Service role full access to research_sessions"
    ON research_sessions FOR ALL
    USING (auth.role() = 'service_role');


-- Agent checkpoints (framework-agnostic)
CREATE TABLE IF NOT EXISTS agent_checkpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    framework       TEXT NOT NULL,
    step_number     INT NOT NULL,
    state_blob      JSONB NOT NULL,
    parent_id       UUID REFERENCES agent_checkpoints(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(session_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session
    ON agent_checkpoints (session_id, step_number DESC);

-- RLS (checkpoints accessed only via service role from backend)
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to agent_checkpoints"
    ON agent_checkpoints FOR ALL
    USING (auth.role() = 'service_role');

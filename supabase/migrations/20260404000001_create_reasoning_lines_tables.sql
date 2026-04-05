-- Reasoning Line Tracker tables
-- Supports GitHub issue #70: Judicial reasoning line detection and tracking

-- Table 1: reasoning_lines — a coherent line of reasoning on a legal question
CREATE TABLE IF NOT EXISTS public.reasoning_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    legal_question TEXT NOT NULL,
    legal_question_embedding vector(1024),
    keywords TEXT[] NOT NULL DEFAULT '{}',
    legal_bases TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'merged', 'superseded', 'dormant')),
    case_count INTEGER NOT NULL DEFAULT 0,
    date_range_start DATE,
    date_range_end DATE,
    avg_embedding vector(1024),
    coherence_score FLOAT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rl_legal_question_embedding ON public.reasoning_lines
    USING hnsw (legal_question_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_rl_status ON public.reasoning_lines (status);
CREATE INDEX idx_rl_legal_bases ON public.reasoning_lines USING GIN (legal_bases);
CREATE INDEX idx_rl_keywords ON public.reasoning_lines USING GIN (keywords);

-- Table 2: reasoning_line_members — junction linking judgments to reasoning lines
CREATE TABLE IF NOT EXISTS public.reasoning_line_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reasoning_line_id UUID NOT NULL REFERENCES public.reasoning_lines(id) ON DELETE CASCADE,
    judgment_id UUID NOT NULL REFERENCES public.judgments(id) ON DELETE CASCADE,
    position_in_line INTEGER,
    similarity_to_centroid FLOAT,
    reasoning_excerpt TEXT,
    reasoning_pattern TEXT,
    outcome_direction TEXT CHECK (outcome_direction IN ('for', 'against', 'mixed', 'procedural')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (reasoning_line_id, judgment_id)
);

CREATE INDEX idx_rlm_line ON public.reasoning_line_members (reasoning_line_id);
CREATE INDEX idx_rlm_judgment ON public.reasoning_line_members (judgment_id);
CREATE INDEX idx_rlm_position ON public.reasoning_line_members (reasoning_line_id, position_in_line);

-- Table 3: reasoning_line_events — DAG edges (branch, merge, drift events)
CREATE TABLE IF NOT EXISTS public.reasoning_line_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL
        CHECK (event_type IN ('branch', 'merge', 'drift', 'reversal', 'consolidation', 'influence')),
    source_line_id UUID REFERENCES public.reasoning_lines(id) ON DELETE SET NULL,
    target_line_id UUID REFERENCES public.reasoning_lines(id) ON DELETE SET NULL,
    trigger_judgment_id UUID REFERENCES public.judgments(id) ON DELETE SET NULL,
    event_date DATE,
    description TEXT,
    drift_score FLOAT,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rle_source ON public.reasoning_line_events (source_line_id);
CREATE INDEX idx_rle_target ON public.reasoning_line_events (target_line_id);
CREATE INDEX idx_rle_type ON public.reasoning_line_events (event_type);
CREATE INDEX idx_rle_date ON public.reasoning_line_events (event_date);

-- Enable RLS (Row Level Security) but allow service role full access
ALTER TABLE public.reasoning_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reasoning_line_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reasoning_line_events ENABLE ROW LEVEL SECURITY;

-- Service role policies (full access for backend)
CREATE POLICY "Service role full access on reasoning_lines"
    ON public.reasoning_lines FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on reasoning_line_members"
    ON public.reasoning_line_members FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on reasoning_line_events"
    ON public.reasoning_line_events FOR ALL
    USING (auth.role() = 'service_role');

-- Authenticated users can read
CREATE POLICY "Authenticated users can read reasoning_lines"
    ON public.reasoning_lines FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read reasoning_line_members"
    ON public.reasoning_line_members FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read reasoning_line_events"
    ON public.reasoning_line_events FOR SELECT
    USING (auth.role() = 'authenticated');

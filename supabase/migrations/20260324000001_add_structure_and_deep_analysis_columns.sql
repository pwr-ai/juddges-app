-- =============================================================================
-- Migration: Add structural segmentation and deep analysis extraction columns
-- =============================================================================
-- This migration adds two new extraction passes to public.judgments:
-- 1. Structural segmentation (Pass 1): splits judgment into standardised sections
-- 2. Deep analysis (Pass 2): analytical assessment of reasoning, complexity, etc.
--
-- Both passes store full results as JSONB with key fields extracted as typed
-- columns for filtering and indexing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pass 1: Structural Segmentation
-- -----------------------------------------------------------------------------
ALTER TABLE public.judgments
    -- extraction metadata
    ADD COLUMN IF NOT EXISTS structure_extraction_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (structure_extraction_status IN ('pending', 'completed', 'failed')),
    ADD COLUMN IF NOT EXISTS structure_extraction_model TEXT,
    ADD COLUMN IF NOT EXISTS structure_extraction_error TEXT,
    ADD COLUMN IF NOT EXISTS structure_extracted_at TIMESTAMPTZ,

    -- raw JSONB payload (full structured output)
    ADD COLUMN IF NOT EXISTS structure_raw_extraction JSONB,

    -- key queryable fields extracted from JSONB
    ADD COLUMN IF NOT EXISTS structure_section_count INTEGER,
    ADD COLUMN IF NOT EXISTS structure_confidence TEXT
        CHECK (structure_confidence IS NULL OR structure_confidence IN ('high', 'medium', 'low')),

    -- per-section summaries for search/display (extracted from JSONB for convenience)
    ADD COLUMN IF NOT EXISTS structure_case_identification_summary TEXT,
    ADD COLUMN IF NOT EXISTS structure_facts_summary TEXT,
    ADD COLUMN IF NOT EXISTS structure_operative_part_summary TEXT,
    ADD COLUMN IF NOT EXISTS structure_court_analysis_summary TEXT,
    ADD COLUMN IF NOT EXISTS structure_conclusion_summary TEXT;

-- -----------------------------------------------------------------------------
-- Pass 2: Deep Analysis
-- -----------------------------------------------------------------------------
ALTER TABLE public.judgments
    -- extraction metadata
    ADD COLUMN IF NOT EXISTS deep_analysis_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (deep_analysis_status IN ('pending', 'completed', 'failed')),
    ADD COLUMN IF NOT EXISTS deep_analysis_model TEXT,
    ADD COLUMN IF NOT EXISTS deep_analysis_error TEXT,
    ADD COLUMN IF NOT EXISTS deep_analysed_at TIMESTAMPTZ,

    -- raw JSONB payload (full structured output)
    ADD COLUMN IF NOT EXISTS deep_analysis_raw JSONB,

    -- key queryable fields for filtering
    ADD COLUMN IF NOT EXISTS deep_complexity_score INTEGER
        CHECK (deep_complexity_score IS NULL OR (deep_complexity_score >= 1 AND deep_complexity_score <= 5)),
    ADD COLUMN IF NOT EXISTS deep_factual_complexity TEXT
        CHECK (deep_factual_complexity IS NULL OR deep_factual_complexity IN ('simple', 'moderate', 'complex')),
    ADD COLUMN IF NOT EXISTS deep_legal_complexity TEXT
        CHECK (deep_legal_complexity IS NULL OR deep_legal_complexity IN ('simple', 'moderate', 'complex')),
    ADD COLUMN IF NOT EXISTS deep_reasoning_quality_score INTEGER
        CHECK (deep_reasoning_quality_score IS NULL OR (deep_reasoning_quality_score >= 1 AND deep_reasoning_quality_score <= 5)),
    ADD COLUMN IF NOT EXISTS deep_legal_domains TEXT[],
    ADD COLUMN IF NOT EXISTS deep_reasoning_patterns TEXT[],
    ADD COLUMN IF NOT EXISTS deep_judicial_tone TEXT,
    ADD COLUMN IF NOT EXISTS deep_precedential_value TEXT
        CHECK (deep_precedential_value IS NULL OR deep_precedential_value IN ('high', 'medium', 'low', 'none')),
    ADD COLUMN IF NOT EXISTS deep_research_value TEXT
        CHECK (deep_research_value IS NULL OR deep_research_value IN ('high', 'medium', 'low')),
    ADD COLUMN IF NOT EXISTS deep_text_quality TEXT
        CHECK (deep_text_quality IS NULL OR deep_text_quality IN ('clean', 'minor_issues', 'significant_issues', 'poor')),
    ADD COLUMN IF NOT EXISTS deep_analysis_confidence TEXT
        CHECK (deep_analysis_confidence IS NULL OR deep_analysis_confidence IN ('high', 'medium', 'low'));


-- -----------------------------------------------------------------------------
-- Indexes for structural segmentation
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_judgments_structure_status
    ON public.judgments (structure_extraction_status);

CREATE INDEX IF NOT EXISTS idx_judgments_structure_confidence
    ON public.judgments (structure_confidence)
    WHERE structure_confidence IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_structure_section_count
    ON public.judgments (structure_section_count)
    WHERE structure_section_count IS NOT NULL;


-- -----------------------------------------------------------------------------
-- Indexes for deep analysis
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_judgments_deep_analysis_status
    ON public.judgments (deep_analysis_status);

CREATE INDEX IF NOT EXISTS idx_judgments_deep_complexity
    ON public.judgments (deep_complexity_score)
    WHERE deep_complexity_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_deep_reasoning_quality
    ON public.judgments (deep_reasoning_quality_score)
    WHERE deep_reasoning_quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_deep_legal_domains
    ON public.judgments USING GIN (deep_legal_domains)
    WHERE deep_legal_domains IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_deep_reasoning_patterns
    ON public.judgments USING GIN (deep_reasoning_patterns)
    WHERE deep_reasoning_patterns IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_deep_judicial_tone
    ON public.judgments (deep_judicial_tone)
    WHERE deep_judicial_tone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judgments_deep_precedential_value
    ON public.judgments (deep_precedential_value)
    WHERE deep_precedential_value IS NOT NULL;


-- -----------------------------------------------------------------------------
-- Composite indexes for common query patterns
-- -----------------------------------------------------------------------------
-- "Show me complex cases with high-quality reasoning"
CREATE INDEX IF NOT EXISTS idx_judgments_deep_complexity_quality
    ON public.judgments (deep_complexity_score, deep_reasoning_quality_score)
    WHERE deep_complexity_score IS NOT NULL AND deep_reasoning_quality_score IS NOT NULL;

-- "Show me well-structured judgments by jurisdiction"
CREATE INDEX IF NOT EXISTS idx_judgments_structure_jurisdiction
    ON public.judgments (jurisdiction, structure_confidence, structure_section_count)
    WHERE structure_extraction_status = 'completed';

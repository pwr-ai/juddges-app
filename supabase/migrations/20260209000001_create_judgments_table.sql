-- =============================================================================
-- Migration: Create judgments table for Polish and UK court decisions
-- =============================================================================
-- This migration creates the core judgments table with support for:
-- - Polish court decisions from HFforLegal/case-law dataset
-- - UK Court of Appeal judgments from JuDDGES/en-appealcourt dataset
-- - Vector embeddings for semantic search (requires pgvector)
-- - Full-text search capabilities
-- - Structured metadata storage
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text search

-- Create judgments table
CREATE TABLE IF NOT EXISTS public.judgments (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core judgment metadata
    case_number TEXT NOT NULL,
    jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('PL', 'UK')),
    court_name TEXT,
    court_level TEXT,  -- e.g., 'Supreme Court', 'Court of Appeal', 'District Court'
    decision_date DATE,
    publication_date DATE,

    -- Content fields
    title TEXT,
    summary TEXT,
    full_text TEXT NOT NULL,

    -- Legal details
    judges JSONB,  -- Array of judge names and roles
    case_type TEXT,  -- e.g., 'Criminal', 'Civil', 'Administrative'
    decision_type TEXT,  -- e.g., 'Judgment', 'Order', 'Ruling'
    outcome TEXT,  -- e.g., 'Granted', 'Dismissed', 'Remanded'

    -- Keywords and classification
    keywords TEXT[],
    legal_topics TEXT[],
    cited_legislation TEXT[],

    -- Vector embedding for semantic search (OpenAI ada-002: 1536 dimensions)
    embedding vector(1536),

    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Source information
    source_dataset TEXT,  -- e.g., 'HFforLegal/case-law', 'JuDDGES/en-appealcourt'
    source_id TEXT,  -- Original ID from source dataset
    source_url TEXT,  -- Link to original judgment

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries

-- Basic search indexes
CREATE INDEX idx_judgments_jurisdiction ON public.judgments(jurisdiction);
CREATE INDEX idx_judgments_decision_date ON public.judgments(decision_date DESC);
CREATE INDEX idx_judgments_case_number ON public.judgments(case_number);
CREATE INDEX idx_judgments_court_name ON public.judgments(court_name);

-- Full-text search index
CREATE INDEX idx_judgments_full_text_search ON public.judgments
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(full_text, '')));

-- Fuzzy text search on case numbers (trigram)
CREATE INDEX idx_judgments_case_number_trgm ON public.judgments
    USING gin(case_number gin_trgm_ops);

-- Array search indexes
CREATE INDEX idx_judgments_keywords ON public.judgments USING gin(keywords);
CREATE INDEX idx_judgments_legal_topics ON public.judgments USING gin(legal_topics);

-- JSONB indexes
CREATE INDEX idx_judgments_judges ON public.judgments USING gin(judges);
CREATE INDEX idx_judgments_metadata ON public.judgments USING gin(metadata);

-- Vector similarity search index (HNSW algorithm for approximate nearest neighbor)
CREATE INDEX idx_judgments_embedding ON public.judgments
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Composite index for common filters
CREATE INDEX idx_judgments_jurisdiction_date ON public.judgments(jurisdiction, decision_date DESC);

-- Add table comments
COMMENT ON TABLE public.judgments IS 'Court judgments and judicial decisions from Poland and UK';
COMMENT ON COLUMN public.judgments.embedding IS 'Vector embedding for semantic search (1536-dim OpenAI ada-002)';
COMMENT ON COLUMN public.judgments.jurisdiction IS 'Country code: PL for Poland, UK for United Kingdom';
COMMENT ON COLUMN public.judgments.metadata IS 'Flexible JSON storage for dataset-specific fields';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_judgments_updated_at
    BEFORE UPDATE ON public.judgments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create helper functions for search

-- Semantic search function using vector similarity
CREATE OR REPLACE FUNCTION public.search_judgments_by_embedding(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_jurisdiction text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    case_number text,
    title text,
    summary text,
    jurisdiction text,
    decision_date date,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.summary,
        j.jurisdiction,
        j.decision_date,
        1 - (j.embedding <=> query_embedding) AS similarity
    FROM public.judgments j
    WHERE
        (filter_jurisdiction IS NULL OR j.jurisdiction = filter_jurisdiction)
        AND (1 - (j.embedding <=> query_embedding)) > match_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Full-text search function
CREATE OR REPLACE FUNCTION public.search_judgments_by_text(
    search_query text,
    filter_jurisdiction text DEFAULT NULL,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    case_number text,
    title text,
    summary text,
    jurisdiction text,
    decision_date date,
    rank float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.summary,
        j.jurisdiction,
        j.decision_date,
        ts_rank(
            to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.summary, '') || ' ' || coalesce(j.full_text, '')),
            plainto_tsquery('english', search_query)
        ) AS rank
    FROM public.judgments j
    WHERE
        (filter_jurisdiction IS NULL OR j.jurisdiction = filter_jurisdiction)
        AND to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.summary, '') || ' ' || coalesce(j.full_text, ''))
            @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.search_judgments_by_embedding IS 'Semantic search using vector embeddings with cosine similarity';
COMMENT ON FUNCTION public.search_judgments_by_text IS 'Full-text search using PostgreSQL tsvector';

-- Grant permissions (adjust based on your auth setup)
-- Example: Allow authenticated users to read, only service role to write
-- ALTER TABLE public.judgments ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Allow public read access" ON public.judgments
--     FOR SELECT USING (true);
--
-- CREATE POLICY "Allow service role full access" ON public.judgments
--     FOR ALL USING (auth.role() = 'service_role');

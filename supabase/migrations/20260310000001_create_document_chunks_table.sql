-- =============================================================================
-- Migration: Create document_chunks table for fine-grained semantic search
-- =============================================================================
-- This table stores text chunks from judgments with their embeddings.
-- Each judgment is split into overlapping ~400-token chunks for precise
-- retrieval. The search pipeline uses chunk-level vector similarity
-- then aggregates back to parent documents.
--
-- Chunk strategy:
--   - Target: 400 tokens per chunk, 100-token overlap
--   - Section-aware: key legal sections (Uzasadnienie, Judgment, etc.)
--     get higher relevance_weight for boosted retrieval
--   - Language-tagged: "pl" for Polish, "en" for UK judgments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.document_chunks (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to parent judgment
    document_id UUID NOT NULL REFERENCES public.judgments(id) ON DELETE CASCADE,

    -- Chunk identification and ordering
    chunk_index INTEGER NOT NULL,

    -- Content
    chunk_text TEXT NOT NULL,
    chunk_type TEXT DEFAULT 'paragraph_block',  -- 'section' or 'paragraph_block'
    section_title TEXT,                          -- e.g., 'Uzasadnienie', 'Judgment'
    is_key_section BOOLEAN DEFAULT FALSE,

    -- Token and relevance metadata
    token_count INTEGER,
    relevance_weight FLOAT DEFAULT 1.0,  -- 1.5 for key sections, 1.0 otherwise

    -- Language (derived from parent judgment's jurisdiction)
    language TEXT,  -- 'pl' or 'en'

    -- Vector embedding (768-dim, text-embedding-3-small)
    embedding vector(768),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one chunk per (document, index) pair
CREATE UNIQUE INDEX idx_document_chunks_doc_index
    ON public.document_chunks(document_id, chunk_index);

-- Foreign key lookup: find all chunks for a judgment
CREATE INDEX idx_document_chunks_document_id
    ON public.document_chunks(document_id);

-- Vector similarity search (HNSW for fast approximate nearest neighbor)
CREATE INDEX idx_document_chunks_embedding
    ON public.document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Language filter
CREATE INDEX idx_document_chunks_language
    ON public.document_chunks(language);

-- Key section filter (for boosted retrieval)
CREATE INDEX idx_document_chunks_key_section
    ON public.document_chunks(is_key_section)
    WHERE is_key_section = TRUE;

-- Full-text search on chunk content
CREATE INDEX idx_document_chunks_text_search
    ON public.document_chunks
    USING gin(to_tsvector('simple', chunk_text));

-- Table comments
COMMENT ON TABLE public.document_chunks IS
    'Text chunks from judgments with embeddings for fine-grained semantic search. Each judgment is split into ~400-token overlapping chunks.';
COMMENT ON COLUMN public.document_chunks.chunk_text IS
    'Text content of the chunk (~400 tokens with 100-token overlap from adjacent chunks)';
COMMENT ON COLUMN public.document_chunks.embedding IS
    'Vector embedding (768-dim OpenAI text-embedding-3-small) for semantic similarity search';
COMMENT ON COLUMN public.document_chunks.relevance_weight IS
    'Retrieval boost factor: 1.5 for key legal sections (Uzasadnienie, Judgment, etc.), 1.0 otherwise';

-- =============================================================================
-- RPC function for chunk-level vector search with parent judgment metadata
-- =============================================================================
CREATE OR REPLACE FUNCTION public.search_chunks_by_embedding(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 20,
    filter_language text DEFAULT NULL,
    filter_jurisdiction text DEFAULT NULL,
    boost_key_sections boolean DEFAULT TRUE
)
RETURNS TABLE (
    chunk_id uuid,
    document_id uuid,
    chunk_index int,
    chunk_text text,
    chunk_type text,
    section_title text,
    is_key_section boolean,
    token_count int,
    language text,
    similarity float,
    -- Parent judgment metadata
    case_number text,
    jurisdiction text,
    court_name text,
    decision_date date,
    title text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS chunk_id,
        c.document_id,
        c.chunk_index,
        c.chunk_text,
        c.chunk_type,
        c.section_title,
        c.is_key_section,
        c.token_count,
        c.language,
        -- Similarity with optional key-section boost
        CASE
            WHEN boost_key_sections AND c.is_key_section THEN
                (1 - (c.embedding <=> query_embedding)) * c.relevance_weight
            ELSE
                (1 - (c.embedding <=> query_embedding))
        END AS similarity,
        j.case_number,
        j.jurisdiction,
        j.court_name,
        j.decision_date,
        j.title
    FROM public.document_chunks c
    JOIN public.judgments j ON c.document_id = j.id
    WHERE
        c.embedding IS NOT NULL
        AND (filter_language IS NULL OR c.language = filter_language)
        AND (filter_jurisdiction IS NULL OR j.jurisdiction = filter_jurisdiction)
        AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY
        CASE
            WHEN boost_key_sections AND c.is_key_section THEN
                (1 - (c.embedding <=> query_embedding)) * c.relevance_weight
            ELSE
                (1 - (c.embedding <=> query_embedding))
        END DESC
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.search_chunks_by_embedding IS
    'Chunk-level semantic search with optional key-section boosting and parent judgment metadata. Returns chunks sorted by similarity with configurable language/jurisdiction filters.';

-- Grant access
GRANT SELECT ON public.document_chunks TO authenticated;
GRANT ALL ON public.document_chunks TO service_role;
GRANT EXECUTE ON FUNCTION public.search_chunks_by_embedding TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_chunks_by_embedding TO service_role;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

-- =============================================================================
-- Migration: Add function to update embeddings via RPC
-- =============================================================================
-- This function properly handles vector type conversion from text format
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_judgment_embedding(
    judgment_id uuid,
    embedding_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.judgments
    SET embedding = embedding_text::vector(768)
    WHERE id = judgment_id;
END;
$$;

COMMENT ON FUNCTION public.update_judgment_embedding IS
    'Update judgment embedding from text format. Converts "[0.1,0.2,...]" to proper vector(768) type.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_judgment_embedding TO service_role, authenticated;

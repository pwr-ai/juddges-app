"""Database operations for legal document retrieval and vector search."""

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from loguru import logger
from supabase import PostgrestAPIError, StorageException

from ._base import SupabaseClientMixin

# ---------------------------------------------------------------------------
# Column projection constants
# legal_documents columns -- embedding deliberately excluded here.
# Callers that need the vector use the get_document_chunks RPC path.
# ---------------------------------------------------------------------------
_LEGAL_DOCUMENT_COLS = (
    "supabase_document_id, document_id, title, document_type, court_name, "
    "date_issued, language, summary, full_text, country, document_number, "
    "issuing_body, ingestion_date, extracted_data, current_version, content_hash"
)


class SupabaseVectorDB(SupabaseClientMixin):
    """Database operations for vector search using pgvector.

    This class provides semantic search capabilities using Supabase's pgvector extension.
    It supports:
    - Pure vector similarity search
    - Hybrid search (vector + full-text + metadata filters)
    - Chunk-level search for RAG applications
    """

    def __init__(self):
        self._init_client("SupabaseVectorDB", postgrest_timeout=60)

    async def search_by_vector(
        self,
        query_embedding: List[float],
        match_count: int = 10,
        match_threshold: float = 0.5,
    ) -> List[Dict[str, Any]]:
        """
        Pure vector similarity search.

        Args:
            query_embedding: 1024-dimensional embedding vector
            match_count: Maximum number of results
            match_threshold: Minimum similarity score (0-1)

        Returns:
            List of documents with similarity scores
        """
        try:
            response = self.client.rpc(
                "search_documents_by_vector",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "match_threshold": match_threshold,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Vector search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Vector search failed: {str(e)}")

    async def hybrid_search(
        self,
        query_text: str,
        query_embedding: List[float],
        document_type: Optional[str] = None,
        court_name: Optional[str] = None,
        language: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        country: Optional[str] = None,
        match_count: int = 10,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining vector similarity, full-text search, and metadata filters.

        Args:
            query_text: Text query for full-text search
            query_embedding: 1024-dimensional embedding vector
            document_type: Filter by document type (e.g., "judgment", "tax_interpretation")
            court_name: Filter by court name (partial match)
            language: Filter by language code (e.g., "pl", "en")
            start_date: Filter documents issued after this date (ISO format)
            end_date: Filter documents issued before this date (ISO format)
            country: Filter by country code (e.g., "PL", "UK")
            match_count: Maximum number of results
            vector_weight: Weight for vector similarity (0-1)
            text_weight: Weight for text search (0-1)

        Returns:
            List of documents with combined scores
        """
        try:
            response = self.client.rpc(
                "hybrid_search_documents",
                {
                    "query_text": query_text,
                    "query_embedding": query_embedding,
                    "p_document_type": document_type,
                    "p_court_name": court_name,
                    "p_language": language,
                    "p_start_date": start_date,
                    "p_end_date": end_date,
                    "p_country": country,
                    "match_count": match_count,
                    "vector_weight": vector_weight,
                    "text_weight": text_weight,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Hybrid search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Hybrid search failed: {str(e)}")

    async def search_chunks(
        self,
        query_embedding: List[float],
        match_count: int = 20,
        match_threshold: float = 0.5,
        include_key_sections_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Chunk-level semantic search for RAG applications.

        Args:
            query_embedding: 1024-dimensional embedding vector
            match_count: Maximum number of chunks to return
            match_threshold: Minimum similarity score (0-1)
            include_key_sections_only: If True, only return key sections (holdings, conclusions)

        Returns:
            List of chunks with similarity scores
        """
        try:
            response = self.client.rpc(
                "search_document_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "match_threshold": match_threshold,
                    "include_key_sections_only": include_key_sections_only,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Chunk search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Chunk search failed: {str(e)}")

    async def get_document_chunks(
        self,
        document_id: str,
        include_embeddings: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Get all chunks for a specific document.

        Args:
            document_id: The document ID
            include_embeddings: Whether to include embedding vectors

        Returns:
            List of chunks ordered by chunk_index
        """
        try:
            response = self.client.rpc(
                "get_document_chunks",
                {
                    "p_document_id": document_id,
                    "include_embeddings": include_embeddings,
                },
            ).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to get document chunks: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get chunks: {str(e)}")

    async def get_document_by_id(
        self,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch a single document by its document_id.

        Args:
            document_id: The document ID

        Returns:
            Document data or None if not found
        """
        try:
            response = (
                self.client.table("legal_documents")
                .select(_LEGAL_DOCUMENT_COLS)
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )

            return response.data[0] if response.data else None
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to fetch document {document_id}: {e}")
            return None

    async def get_documents_by_ids(
        self,
        document_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Fetch multiple documents by their document_ids.

        Args:
            document_ids: List of document IDs

        Returns:
            List of document data
        """
        if not document_ids:
            return []

        try:
            response = (
                self.client.table("legal_documents")
                .select(_LEGAL_DOCUMENT_COLS)
                .in_("document_id", document_ids)
                .execute()
            )

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to fetch documents: {e}")
            return []

    async def get_embedding_stats(self) -> Dict[str, Any]:
        """
        Get statistics about embedding coverage.

        Returns:
            Dictionary with embedding statistics
        """
        try:
            response = self.client.rpc("get_embedding_stats").execute()
            return response.data[0] if response.data else {}
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Failed to get embedding stats: {e}")
            return {}

    async def full_text_search(
        self,
        query: str,
        document_type: Optional[str] = None,
        language: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Full-text search without vector similarity (fallback when no embeddings).

        Args:
            query: Search query text
            document_type: Filter by document type
            language: Filter by language
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of matching documents
        """
        try:
            # Build query with FTS
            query_builder = (
                self.client.table("legal_documents")
                .select(
                    "supabase_document_id, document_id, title, document_type, court_name, date_issued, language, summary"
                )
                .text_search("full_text", query, config="simple")
            )

            if document_type:
                query_builder = query_builder.eq("document_type", document_type)
            if language:
                query_builder = query_builder.eq("language", language)

            response = query_builder.range(offset, offset + limit - 1).execute()

            return response.data or []
        except (PostgrestAPIError, StorageException) as e:
            logger.error(f"Full-text search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------
_vector_db: Optional[SupabaseVectorDB] = None


def get_vector_db() -> SupabaseVectorDB:
    """Get the shared SupabaseVectorDB instance for vector search operations."""
    global _vector_db
    if _vector_db is None:
        try:
            _vector_db = SupabaseVectorDB()
        except ValueError as e:
            logger.error(f"Vector database not configured: {e}")
            raise HTTPException(status_code=500, detail=f"Vector database configuration error: {str(e)}")
    return _vector_db


def reset_vector_db():
    """Reset the vector database singleton."""
    global _vector_db
    if _vector_db is not None:
        try:
            if hasattr(_vector_db.client, "close"):
                _vector_db.client.close()
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Error closing Vector Supabase client: {e}")
    _vector_db = None


__all__ = [
    "SupabaseVectorDB",
    "get_vector_db",
    "reset_vector_db",
]

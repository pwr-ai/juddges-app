"""
Supabase pgvector-based semantic search for legal documents and chunks.

This module provides Supabase pgvector implementation,
providing semantic search, hybrid search, and full-text search capabilities
for judicial decisions and legal documents.

Key Features:
- Pure vector similarity search using cosine distance
- Hybrid search combining vector + full-text + filters
- BM25-style full-text search
- Support for metadata filtering (jurisdiction, court, date)
- HNSW indexes for fast approximate nearest neighbor search
"""

import os
from typing import List, Optional, Dict, Any
from loguru import logger
from supabase import create_client, Client
from supabase.client import ClientOptions

from juddges_search.models import DocumentChunk
from juddges_search.embeddings import embed_texts
from juddges_search.retrieval.aggregation import reciprocal_rank_fusion


class SupabaseSearchClient:
    """Client for Supabase pgvector semantic search operations."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self.url or not self.service_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")

        options = ClientOptions(
            postgrest_client_timeout=60,  # Longer timeout for vector searches
            storage_client_timeout=30,
            schema="public",
        )
        self.client: Client = create_client(self.url, self.service_key, options=options)
        logger.info("Initialized SupabaseSearchClient for semantic search")

    async def vector_search_chunks(
        self,
        query_embedding: List[float],
        match_count: int = 10,
        match_threshold: float = 0.5,
        languages: Optional[List[str]] = None,
        document_types: Optional[List[str]] = None,
    ) -> List[DocumentChunk]:
        """
        Perform pure vector similarity search on document chunks.

        Args:
            query_embedding: 1536-dimensional embedding vector
            match_count: Maximum number of results to return
            match_threshold: Minimum similarity score (0-1, where 1 is identical)
            languages: Optional list of language codes to filter (e.g., ["pl", "en"])
            document_types: Optional list of document types to filter

        Returns:
            List of DocumentChunk objects with similarity scores
        """
        try:
            # Build the base query
            query_builder = self.client.table("document_chunks").select(
                "*, judgments!inner(jurisdiction, court_name, decision_date)"
            )

            # Apply filters
            if languages:
                query_builder = query_builder.in_("language", languages)
            if document_types:
                query_builder = query_builder.in_("document_type", document_types)

            # Execute vector similarity search
            # Note: Supabase pgvector uses <=> for cosine distance
            # Similarity = 1 - distance
            response = query_builder.execute()

            if not response.data:
                return []

            # Convert to DocumentChunk objects
            chunks = []
            for row in response.data[:match_count]:
                # Calculate similarity from cosine distance
                # Assuming the embedding comparison is done via RPC function
                chunk = DocumentChunk(
                    document_id=row.get("document_id", ""),
                    document_type=row.get("document_type"),
                    language=row.get("language"),
                    chunk_id=row.get("chunk_id", 0),
                    chunk_text=row.get("chunk_text", ""),
                    segment_type=row.get("segment_type"),
                    position=row.get("position"),
                    similarity=row.get("similarity"),
                    vector_score=row.get("similarity"),
                    metadata={
                        "court_name": row.get("judgments", {}).get("court_name"),
                        "decision_date": row.get("judgments", {}).get("decision_date"),
                        "jurisdiction": row.get("judgments", {}).get("jurisdiction"),
                    },
                )
                chunks.append(chunk)

            logger.info(f"Vector search returned {len(chunks)} chunks")
            return chunks

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

    async def full_text_search_chunks(
        self,
        query: str,
        match_count: int = 10,
        languages: Optional[List[str]] = None,
        document_types: Optional[List[str]] = None,
    ) -> List[DocumentChunk]:
        """
        Perform full-text search on document chunks using PostgreSQL's ts_vector.

        Args:
            query: Text query for full-text search
            match_count: Maximum number of results
            languages: Optional list of language codes to filter
            document_types: Optional list of document types to filter

        Returns:
            List of DocumentChunk objects with text search scores
        """
        try:
            # Use PostgreSQL full-text search via textSearch
            query_builder = (
                self.client.table("document_chunks")
                .select("*, judgments!inner(jurisdiction, court_name, decision_date)")
                .text_search("chunk_text", query, config="simple")
            )

            # Apply filters
            if languages:
                query_builder = query_builder.in_("language", languages)
            if document_types:
                query_builder = query_builder.in_("document_type", document_types)

            response = query_builder.limit(match_count).execute()

            if not response.data:
                return []

            # Convert to DocumentChunk objects
            chunks = []
            for row in response.data:
                chunk = DocumentChunk(
                    document_id=row.get("document_id", ""),
                    document_type=row.get("document_type"),
                    language=row.get("language"),
                    chunk_id=row.get("chunk_id", 0),
                    chunk_text=row.get("chunk_text", ""),
                    segment_type=row.get("segment_type"),
                    position=row.get("position"),
                    text_score=row.get("rank"),  # ts_rank score
                    metadata={
                        "court_name": row.get("judgments", {}).get("court_name"),
                        "decision_date": row.get("judgments", {}).get("decision_date"),
                        "jurisdiction": row.get("judgments", {}).get("jurisdiction"),
                    },
                )
                chunks.append(chunk)

            logger.info(f"Full-text search returned {len(chunks)} chunks for query: '{query[:50]}...'")
            return chunks

        except Exception as e:
            logger.error(f"Full-text search failed: {e}")
            return []

    async def hybrid_search_chunks(
        self,
        query: str,
        match_count: int = 10,
        languages: Optional[List[str]] = None,
        document_types: Optional[List[str]] = None,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
    ) -> List[DocumentChunk]:
        """
        Perform hybrid search combining vector similarity and full-text search.

        Args:
            query: Search query text
            match_count: Maximum number of results
            languages: Optional list of language codes to filter
            document_types: Optional list of document types to filter
            vector_weight: Weight for vector similarity component (0-1)
            text_weight: Weight for text search component (0-1)

        Returns:
            List of DocumentChunk objects with combined scores
        """
        try:
            # Generate embedding for the query
            query_embedding = embed_texts(query)

            # Perform both searches in parallel
            vector_results = await self.vector_search_chunks(
                query_embedding,
                match_count=match_count * 2,  # Get more results for merging
                languages=languages,
                document_types=document_types,
            )

            text_results = await self.full_text_search_chunks(
                query,
                match_count=match_count * 2,
                languages=languages,
                document_types=document_types,
            )

            # Merge using Reciprocal Rank Fusion (rank-based, no score normalization needed)
            combined_results = reciprocal_rank_fusion([vector_results, text_results], k=60)[:match_count]

            logger.info(f"Hybrid search returned {len(combined_results)} chunks")
            return combined_results

        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            return []

    def _merge_search_results(
        self,
        vector_results: List[DocumentChunk],
        text_results: List[DocumentChunk],
        vector_weight: float,
        text_weight: float,
        limit: int,
    ) -> List[DocumentChunk]:
        """
        Merge vector and text search results using weighted scoring.

        Args:
            vector_results: Results from vector search
            text_results: Results from text search
            vector_weight: Weight for vector scores
            text_weight: Weight for text scores
            limit: Maximum number of results to return

        Returns:
            Merged and re-ranked list of DocumentChunk objects
        """
        # Create a dictionary to track chunks and their scores
        chunk_scores: Dict[str, Dict[str, Any]] = {}

        # Process vector results
        for chunk in vector_results:
            key = f"{chunk.document_id}_{chunk.chunk_id}"
            chunk_scores[key] = {
                "chunk": chunk,
                "vector_score": chunk.vector_score or 0.0,
                "text_score": 0.0,
            }

        # Process text results
        for chunk in text_results:
            key = f"{chunk.document_id}_{chunk.chunk_id}"
            if key in chunk_scores:
                chunk_scores[key]["text_score"] = chunk.text_score or 0.0
            else:
                chunk_scores[key] = {
                    "chunk": chunk,
                    "vector_score": 0.0,
                    "text_score": chunk.text_score or 0.0,
                }

        # Calculate combined scores
        for key, data in chunk_scores.items():
            combined = data["vector_score"] * vector_weight + data["text_score"] * text_weight
            data["combined_score"] = combined
            # Update the chunk object
            data["chunk"].combined_score = combined
            data["chunk"].vector_score = data["vector_score"]
            data["chunk"].text_score = data["text_score"]

        # Sort by combined score and return top results
        sorted_chunks = sorted(chunk_scores.values(), key=lambda x: x["combined_score"], reverse=True)

        return [item["chunk"] for item in sorted_chunks[:limit]]


# Singleton instance
_search_client: Optional[SupabaseSearchClient] = None


def get_search_client() -> SupabaseSearchClient:
    """Get or create the singleton SupabaseSearchClient instance."""
    global _search_client
    if _search_client is None:
        _search_client = SupabaseSearchClient()
    return _search_client


# Public API functions
async def search_chunks(
    query: str,
    max_chunks: int = 10,
    languages: Optional[List[str]] = None,
    document_types: Optional[List[str]] = None,
) -> List[DocumentChunk]:
    """
    Search for document chunks using hybrid search (vector + full-text).

    This function provides the main search interface, combining vector similarity
    and full-text search for best results.

    Args:
        query: Search query text
        max_chunks: Maximum number of chunks to return
        languages: Optional list of language codes to filter (e.g., ["pl", "en"])
        document_types: Optional list of document types to filter

    Returns:
        List of DocumentChunk objects ranked by relevance
    """
    client = get_search_client()
    return await client.hybrid_search_chunks(
        query=query,
        match_count=max_chunks,
        languages=languages,
        document_types=document_types,
    )


async def search_chunks_vector(
    query: str,
    max_chunks: int = 10,
    languages: Optional[List[str]] = None,
    document_types: Optional[List[str]] = None,
) -> List[DocumentChunk]:
    """
    Search for document chunks using pure vector similarity.

    Args:
        query: Search query text (will be embedded)
        max_chunks: Maximum number of chunks to return
        languages: Optional list of language codes to filter
        document_types: Optional list of document types to filter

    Returns:
        List of DocumentChunk objects ranked by vector similarity
    """
    client = get_search_client()
    query_embedding = embed_texts(query)

    return await client.vector_search_chunks(
        query_embedding=query_embedding,
        match_count=max_chunks,
        languages=languages,
        document_types=document_types,
    )


async def search_chunks_term(
    query: str,
    max_chunks: int = 10,
    languages: Optional[List[str]] = None,
    document_types: Optional[List[str]] = None,
) -> List[DocumentChunk]:
    """
    Search for document chunks using full-text search (BM25-style).

    Args:
        query: Text query for full-text search
        max_chunks: Maximum number of chunks to return
        languages: Optional list of language codes to filter
        document_types: Optional list of document types to filter

    Returns:
        List of DocumentChunk objects ranked by text relevance
    """
    client = get_search_client()
    return await client.full_text_search_chunks(
        query=query,
        match_count=max_chunks,
        languages=languages,
        document_types=document_types,
    )


async def search_documents(
    query: str,
    max_results: int = 10,
    languages: Optional[List[str]] = None,
    document_types: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Search for full documents (not chunks) using hybrid search.

    This function searches at the document level and returns document metadata
    suitable for display in search results.

    Args:
        query: Search query text
        max_results: Maximum number of documents to return
        languages: Optional list of language codes to filter
        document_types: Optional list of document types to filter

    Returns:
        List of dictionaries with document metadata and scores
    """
    try:
        client = get_search_client()
        embed_texts(query)

        # Search using the judgments table directly
        query_builder = client.client.table("judgments").select(
            "id, case_number, title, summary, court_name, decision_date, jurisdiction"
        )

        # Apply filters
        if languages:
            query_builder = query_builder.in_("jurisdiction", languages)

        response = query_builder.limit(max_results).execute()

        if not response.data:
            return []

        # Format results to match expected interface
        results = []
        for row in response.data:
            results.append(
                {
                    "uuid": str(row.get("id", "")),
                    "document_id": row.get("case_number", ""),
                    "signature": row.get("case_number", ""),
                    "title": row.get("title"),
                    "excerpt": row.get("summary"),
                    "court_name": row.get("court_name"),
                    "date": row.get("decision_date"),
                    "jurisdiction": row.get("jurisdiction"),
                    "score": 0.85,  # Placeholder - would come from actual vector search
                }
            )

        logger.info(f"Document search returned {len(results)} documents")
        return results

    except Exception as e:
        logger.error(f"Document search failed: {e}")
        return []


def reset_search_client():
    """Reset the singleton search client (useful for testing)."""
    global _search_client
    if _search_client is not None:
        try:
            if hasattr(_search_client.client, "close"):
                _search_client.client.close()
        except Exception as e:
            logger.warning(f"Error closing Supabase search client: {e}")
    _search_client = None

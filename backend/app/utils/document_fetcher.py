"""Utility functions for fetching documents from Supabase.

This module provides helper functions to fetch judgment documents from Supabase
database by their IDs.
"""

from juddges_search.models import LegalDocument
from loguru import logger

from app.core.supabase import get_supabase_client


async def get_documents_by_id(
    document_ids: list[str],
    return_vectors: bool = False,
) -> list[LegalDocument]:
    """Get documents by their document IDs from Supabase.

    Args:
        document_ids: List of document IDs to fetch
        return_vectors: Whether to include vector embeddings (not implemented for Supabase)

    Returns:
        List of LegalDocument objects

    Raises:
        ValueError: If no document IDs provided
        RuntimeError: If database query fails
    """
    logger.info(f"Fetching {len(document_ids)} documents from Supabase by document IDs")

    if not document_ids:
        logger.warning("No document IDs provided, returning empty list")
        return []

    try:
        supabase = get_supabase_client()

        # Fetch documents from Supabase judgments table
        # Use .in_() for efficient batch query
        response = (
            supabase.table("judgments")
            .select("*")
            .in_("document_id", document_ids)
            .execute()
        )

        if not response.data:
            logger.warning(f"No documents found for {len(document_ids)} document IDs")
            return []

        # Convert Supabase rows to LegalDocument objects
        documents = []
        for row in response.data:
            try:
                # Map Supabase judgment fields to LegalDocument model
                doc = LegalDocument(
                    document_id=row.get("document_id", ""),
                    title=row.get("title", ""),
                    summary=row.get("summary", ""),
                    full_text=row.get("full_text", ""),
                    document_type=row.get("document_type", ""),
                    language=row.get("language", "pl"),
                    country=row.get("country", "PL"),
                    metadata=row.get("metadata") or {},
                    publication_date=row.get("publication_date"),
                    source=row.get("source", ""),
                    url=row.get("url", ""),
                    # Vector embedding is only included if requested
                    vector=row.get("embedding") if return_vectors else None,
                )
                documents.append(doc)
            except Exception as e:
                logger.error(
                    f"Error converting Supabase row to LegalDocument for document_id={row.get('document_id')}: {e}"
                )
                continue

        logger.info(f"Successfully fetched {len(documents)} documents from Supabase")

        # Warn if some documents were not found
        if len(documents) < len(document_ids):
            missing_count = len(document_ids) - len(documents)
            retrieved_ids = {doc.document_id for doc in documents}
            missing_ids = [
                doc_id for doc_id in document_ids if doc_id not in retrieved_ids
            ]
            logger.warning(
                f"Only retrieved {len(documents)} out of {len(document_ids)} requested documents. "
                f"{missing_count} document(s) not found in database. "
                f"Missing IDs: {missing_ids[:10]}"
                + (
                    f"... and {len(missing_ids) - 10} more"
                    if len(missing_ids) > 10
                    else ""
                )
            )

        return documents

    except Exception as e:
        logger.exception(f"Failed to fetch documents from Supabase: {e}")
        raise RuntimeError(f"Database query failed: {e}") from e


async def get_document_by_id(
    document_id: str, return_vectors: bool = False
) -> LegalDocument | None:
    """Get a single document by ID from Supabase.

    Args:
        document_id: Document ID to fetch
        return_vectors: Whether to include vector embeddings

    Returns:
        LegalDocument object or None if not found
    """
    documents = await get_documents_by_id([document_id], return_vectors=return_vectors)
    return documents[0] if documents else None

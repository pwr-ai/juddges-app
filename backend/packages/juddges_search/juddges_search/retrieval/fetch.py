"""Direct document fetch operations by identifier (ID or UUID)."""

import asyncio
from typing import Optional
from weaviate.classes.query import Filter

from loguru import logger
from juddges_search.db.weaviate_db import WeaviateLegalDatabase
from juddges_search.models import LegalDocument
from juddges_search.retrieval.config import MAX_UUIDS_PER_REQUEST
from juddges_search.retrieval.utils import convert_weaviate_obj_to_legal_document, validate_uuids



async def get_documents_by_id(
    document_ids: list[str], 
    return_vectors: bool = False,
    return_properties: Optional[list[str]] = None
) -> list[LegalDocument]:
    """Get documents by their document IDs using optimized batch filtering.
    
    Uses a single filtered query with `Filter.by_property("document_id").contains_any()`
    to fetch all documents in one batch operation. This is highly efficient for fetching
    multiple documents (typically ~130ms for 50 documents with return_properties).

    Args:
        document_ids: List of document IDs to fetch
        return_vectors: Whether to include vector data in the documents
        return_properties: Optional list of property names to return. If None, returns all properties.
                          Use to optimize performance by fetching only needed fields.
                          Example: ["title", "summary", "document_type"]

    Returns:
        List of LegalDocument objects
    """
    logger.info(f"Getting documents by IDs: {len(document_ids)} documents (using batch contains_any)")

    if not document_ids:
        logger.warning("No document IDs provided, returning empty list")
        return []

    # Direct filtered query approach (single query - optimized with contains_any)
    # IMPORTANT: Use direct filter creation instead of build_weaviate_filters to ensure
    # no unintended filters (languages, document_types, etc.) are applied to fast ID lookups
    async with WeaviateLegalDatabase(use_pool=True) as db:
        # Create filter directly for document_ids only (no other filters should apply)
        if len(document_ids) == 1:
            filter_obj = Filter.by_property("document_id").equal(document_ids[0])
        else:
            # Multiple IDs: use contains_any for batch efficiency
            filter_obj = Filter.by_property("document_id").contains_any(document_ids)
        
        # FIX: Always include required fields (document_id is required for conversion)
        # If return_properties is specified, merge with required fields
        # If return_properties is empty list, pass None (Weaviate interprets [] as "return no properties")
        REQUIRED_FIELDS = ["document_id", "document_type", "language", "country", "full_text"]
        
        if return_properties and len(return_properties) > 0:
            # Merge required fields with requested properties
            actual_return_properties = list(set(return_properties) | set(REQUIRED_FIELDS))
        else:
            # None means return all properties
            actual_return_properties = None
        
        response = await db.legal_documents_collection.query.fetch_objects(
            filters=filter_obj,
            include_vector=return_vectors,
            return_properties=actual_return_properties,
            limit=len(document_ids),
        )
        
        retrieved_count = len(response.objects)
        requested_count = len(document_ids)
        logger.info(
            f"Retrieved {retrieved_count} documents using direct filter (indexed property). "
            f"Requested: {requested_count}, Retrieved: {retrieved_count}"
        )
        
        # Warn if fewer documents retrieved than requested (some may not exist in database)
        if retrieved_count < requested_count:
            missing_count = requested_count - retrieved_count
            # Calculate all missing IDs
            retrieved_ids = {obj.properties.get("document_id") for obj in response.objects if obj.properties}
            missing_ids = [doc_id for doc_id in document_ids if doc_id not in retrieved_ids]
            
            logger.warning(
                f"Only retrieved {retrieved_count} out of {requested_count} requested documents. "
                f"{missing_count} document(s) may not exist in the database. "
                f"All missing document IDs ({len(missing_ids)}): {missing_ids}"
            )
        
        return [convert_weaviate_obj_to_legal_document(obj, include_vectors=return_vectors) for obj in response.objects]


async def get_documents_by_uuid(
    document_uuids: list[str],
    return_vectors: bool = False,
    include_scores: bool = False,
    return_properties: Optional[list[str]] = None,
) -> list[LegalDocument]:
    """Get documents by Weaviate UUIDs using a single batch query.

    Uses Weaviate's `fetch_objects` with `Filter.by_id().contains_any()` to fetch
    all UUIDs in a single batch query. This is much more efficient than individual fetches.

    Args:
        document_uuids: List of Weaviate document UUIDs
        return_vectors: Whether to include vector data in the documents
        include_scores: Whether to include scores in metadata
        return_properties: Optional list of property names to return. If None, returns all properties.
                          Use empty list [] to return only UUIDs (lightweight).
                          Example: ["document_id", "title", "summary"] returns only those fields.

    Returns:
        List of LegalDocument objects (order may differ from input UUIDs).
        Missing properties will be set to None or default values.
    """
    logger.info(f"Getting documents by UUIDs: {len(document_uuids)} UUIDs, return_properties={return_properties}")

    if not document_uuids:
        logger.warning("No document UUIDs provided, returning empty list")
        return []

    # Input validation: check list length
    if len(document_uuids) > MAX_UUIDS_PER_REQUEST:
        raise ValueError(
            f"Maximum {MAX_UUIDS_PER_REQUEST} UUIDs allowed per request. Received {len(document_uuids)} UUIDs."
        )

    validate_uuids(document_uuids)

    async with WeaviateLegalDatabase(use_pool=True) as db:
        try:
            # OPTIMIZED: Fetch ALL objects in ONE batch query using Filter.by_id().contains_any()
            # This is much faster than individual fetches!
            # Fetch all documents by UUIDs in a SINGLE batch query
            response = await db.legal_documents_collection.query.fetch_objects(
                filters=Filter.by_id().contains_any(document_uuids),
                include_vector=return_vectors,
                return_properties=return_properties,
                limit=len(document_uuids),
            )
            
            valid_objects = list(response.objects)

            # Convert to LegalDocument objects
            documents = [
                convert_weaviate_obj_to_legal_document(
                    obj, include_vectors=return_vectors, include_scores=include_scores
                )
                for obj in valid_objects
            ]

            # Note: Property filtering happens at the model level, not here
            # The convert_weaviate_obj_to_legal_document function will include all properties
            # and the Pydantic model will handle the rest

            logger.info(
                f"Retrieved {len(documents)} documents from {len(document_uuids)} UUIDs "
                f"using batch fetch (properties: {return_properties or 'all'})"
            )
            return documents

        except ValueError as e:
            logger.error(f"Validation error in batch UUID fetch: {e}")
            raise
        except Exception as e:
            logger.exception(f"Batch UUID fetch failed: {e}. Attempted to fetch {len(document_uuids)} UUIDs.")
            raise RuntimeError(f"Failed to fetch documents by UUID: {e}") from e

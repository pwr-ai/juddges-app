"""Document similarity search operations."""

from loguru import logger
from weaviate.classes.query import Filter, MetadataQuery
from juddges_search.db.weaviate_db import WeaviateLegalDatabase
from juddges_search.embeddings import VectorName
from juddges_search.models import LegalDocument
from juddges_search.retrieval.utils import (
    convert_weaviate_obj_to_legal_document,
    normalize_document_id,
    generate_document_id_variants,
)


async def find_similar_documents(
    document_id: str, top_k: int = 10, exclude_self: bool = True
) -> list[tuple[LegalDocument, float, str]]:
    """Find similar documents based on vector similarity.

    Args:
        document_id: Document ID to find similar documents for
        top_k: Maximum number of similar documents to return
        exclude_self: Whether to exclude the input document from results

    Returns:
        List of tuples containing (LegalDocument, similarity_score, db_uuid)
    """
    logger.info(f"Finding similar documents for: {document_id}")

    try:
        async with WeaviateLegalDatabase(use_pool=True) as db:
            # Try to find the document - try multiple ID formats to handle variations
            # (with/without /doc/ prefix, different cases, etc.)
            doc_response = None
            id_variants = generate_document_id_variants(document_id)
            
            for doc_id_variant in id_variants:
                doc_response = await db.legal_documents_collection.query.fetch_objects(
                    filters=Filter.by_property("document_id").equal(doc_id_variant),
                    include_vector=True,
                    limit=1,
                )
                if doc_response.objects:
                    logger.info(f"Found document using ID variant: {doc_id_variant}")
                    break

            if not doc_response or not doc_response.objects:
                logger.warning(f"Document not found with any ID variant. Tried: {id_variants}")
                return []

            # Get the actual document object and its actual document_id from the database
            found_doc_obj = doc_response.objects[0]
            actual_document_id = found_doc_obj.properties.get("document_id", document_id)
            found_doc_uuid = str(found_doc_obj.uuid)
            logger.info(f"Found document with actual ID: {actual_document_id} (requested: {document_id}), UUID: {found_doc_uuid}")

            vector_data = found_doc_obj.vector
            if isinstance(vector_data, dict):
                query_vector = vector_data.get("base", list(vector_data.values())[0] if vector_data else None)
            else:
                query_vector = vector_data

            if query_vector is None:
                logger.error(f"No vector found for document: {actual_document_id}")
                return []

            logger.info(f"Found vector of length: {len(query_vector)}")

            # Fetch extra results to account for self-exclusion
            EXCLUDE_SELF_BUFFER = 5
            limit = top_k + EXCLUDE_SELF_BUFFER if exclude_self else top_k

            similar_response = await db.legal_documents_collection.query.near_vector(
                near_vector=query_vector,
                limit=limit,
                return_metadata=MetadataQuery(certainty=True),
                target_vector=VectorName.BASE,
            )

            logger.info(f"Found {len(similar_response.objects)} similar documents")

            results = []
            # Use the actual document_id from the database for exclusion, not the input parameter
            normalized_actual_id = normalize_document_id(actual_document_id)
            normalized_requested_id = normalize_document_id(document_id)
            # Include both the actual ID and requested ID in seen_ids to be safe
            seen_ids = {normalized_actual_id, normalized_requested_id} if exclude_self else set()
            # Also track by UUID to catch same document even if IDs are completely different formats
            excluded_uuids = {found_doc_uuid} if exclude_self else set()

            for obj in similar_response.objects:
                obj_uuid = str(obj.uuid)
                # Exclude by UUID first (most reliable)
                if obj_uuid in excluded_uuids:
                    logger.debug(f"Excluding document by UUID: {obj_uuid}")
                    continue
                
                doc_id = obj.properties.get("document_id", "")
                normalized_doc_id = normalize_document_id(doc_id)

                # Only use ID-based exclusion if we have a valid normalized ID
                # Skip ID comparison when normalized ID is empty to avoid false duplicates
                if normalized_doc_id:
                    if normalized_doc_id in seen_ids:
                        logger.debug(f"Excluding document by normalized ID: {normalized_doc_id}")
                        continue
                    seen_ids.add(normalized_doc_id)

                # Use utility function to convert Weaviate object to LegalDocument
                doc = convert_weaviate_obj_to_legal_document(obj, include_vectors=False)

                certainty = getattr(obj.metadata, "certainty", 0.0)
                db_uuid = str(obj.uuid)

                results.append((doc, float(certainty), db_uuid))

                if len(results) >= top_k:
                    break

            logger.info(f"Returning {len(results)} similar documents")
            return results
    except Exception as e:
        logger.exception(f"Error finding similar documents: {e}")
        raise RuntimeError(f"Similarity search failed: {e}") from e

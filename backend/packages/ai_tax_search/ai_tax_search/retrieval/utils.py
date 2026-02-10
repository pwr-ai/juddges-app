"""Utility functions for retrieval operations."""

import json
import uuid
from collections import OrderedDict
from datetime import datetime
from typing import Any, Optional, Union

from loguru import logger
from ai_tax_search.models import LegalDocument, LegalDocumentMetadata, DocumentChunk, DocumentType
from ai_tax_search.retrieval.config import MAX_INVALID_UUIDS_TO_SHOW, SECONDS_TO_MS


def _parse_metadata(obj: Any) -> dict[str, Any]:
    """Parse metadata field, handling both string and dict types.

    Args:
        obj: Weaviate object with metadata property

    Returns:
        Dictionary containing parsed metadata
    """
    metadata: dict[str, Any] = {}
    if hasattr(obj, "metadata") and hasattr(obj.metadata, "score"):
        metadata["score"] = obj.metadata.score

    metadata_prop = obj.properties.get("metadata")
    if isinstance(metadata_prop, str):
        try:
            parsed_metadata = json.loads(metadata_prop)
            if isinstance(parsed_metadata, dict):
                metadata.update(parsed_metadata)
        except (json.JSONDecodeError, TypeError):
            pass
    elif isinstance(metadata_prop, dict):
        metadata.update(metadata_prop)
    return metadata


def parse_list_property(prop: Any) -> list[Any]:
    """Safely convert a property to a list.

    Handles various input types:
    - If already a list, returns it as-is
    - If a JSON string, parses it and returns if it's a list
    - Otherwise returns an empty list

    Args:
        prop: Property value (can be list, JSON string, or other)

    Returns:
        List representation of the property, or empty list if conversion fails
    """
    if isinstance(prop, list):
        return prop
    if isinstance(prop, str):
        try:
            val = json.loads(prop)
            if isinstance(val, list):
                return val
        except (json.JSONDecodeError, TypeError):
            pass
    return []


def parse_string_property(prop: Any) -> str:
    """Safely convert a property to a string.

    Handles various input types:
    - If None, returns empty string
    - If already a string, returns it as-is
    - Otherwise, converts to JSON string representation

    Args:
        prop: Property value (can be any type)

    Returns:
        String representation of the property, or empty string if None
    """
    if prop is None:
        return ""
    if isinstance(prop, str):
        return prop
    return json.dumps(prop, ensure_ascii=False)


def normalize_document_id(doc_id: str) -> str:
    """Normalize a document ID for comparison.

    Removes /doc/ prefix, strips whitespace, and converts to lowercase.
    This ensures consistent comparison regardless of ID format variations.

    Args:
        doc_id: Document ID to normalize (can have /doc/ prefix, varying case, whitespace)

    Returns:
        Normalized document ID suitable for comparison

    Examples:
        >>> normalize_document_id("/doc/ABC123")
        'abc123'
        >>> normalize_document_id("  ABC123  ")
        'abc123'
        >>> normalize_document_id("/doc/  ABC123  ")
        'abc123'
    """
    if not doc_id:
        return ""
    return doc_id.replace("/doc/", "").strip().lower()


def generate_document_id_variants(document_id: str) -> list[str]:
    """Generate possible variants of a document ID for flexible searching.

    Creates multiple ID format variations to handle different storage formats:
    - Original format
    - Stripped whitespace
    - Without /doc/ prefix
    - With /doc/ prefix

    Args:
        document_id: Original document ID

    Returns:
        List of unique ID variants to try when searching, preserving order

    Examples:
        >>> generate_document_id_variants("/doc/ABC123")
        ['/doc/ABC123', 'ABC123', '/doc/ABC123']
        >>> generate_document_id_variants("  ABC123  ")
        ['  ABC123  ', 'ABC123', '/doc/ABC123']
    """
    if not document_id:
        return []
    
    variants = [
        document_id,  # Original format
        document_id.strip(),  # Stripped
        document_id.replace("/doc/", "").strip(),  # Without /doc/ prefix
        f"/doc/{document_id.replace('/doc/', '').strip()}",  # With /doc/ prefix
    ]
    
    # Remove duplicates while preserving order
    seen = set()
    unique_variants = []
    for variant in variants:
        if variant and variant not in seen:
            seen.add(variant)
            unique_variants.append(variant)
    
    return unique_variants


def convert_weaviate_obj_to_legal_document(
    obj, include_vectors: bool = False, include_scores: bool = False
) -> LegalDocument:
    """Convert a Weaviate object to a LegalDocument model.

    Handles optional fields safely - missing properties will be set to None or appropriate defaults.

    Args:
        obj: Weaviate object from query response
        include_vectors: Whether to include vector data in the document
        include_scores: Whether to include score in metadata (from obj.score or obj.metadata.score)

    Returns:
        LegalDocument object
    """
    props = obj.properties if hasattr(obj, "properties") else {}

    # Helper to safely get optional string fields
    def get_opt_str(key: str) -> Optional[str]:
        val = props.get(key)
        if val is None or val == "":
            return None
        # Handle empty arrays - return None instead of converting to "[]" string
        if isinstance(val, list) and len(val) == 0:
            return None
        # If it's a non-empty array, convert to comma-separated string
        if isinstance(val, list):
            # Filter out empty items and join
            non_empty = [str(item).strip() for item in val if item and str(item).strip()]
            return ", ".join(non_empty) if non_empty else None
        return parse_string_property(val) if not isinstance(val, str) else val

    # Helper to safely get optional list fields
    def get_opt_list(key: str) -> list:
        val = props.get(key)
        if val is None:
            return []
        return parse_list_property(val)

    # Parse metadata
    metadata = _parse_metadata(obj)

    # Add score to metadata if requested
    if include_scores:
        score = None
        # Try to get score from obj.score (BM25 queries)
        if hasattr(obj, "score"):
            score = obj.score
        # Try to get score from obj.metadata.score (vector/hybrid queries)
        elif hasattr(obj, "metadata") and hasattr(obj.metadata, "score"):
            score = obj.metadata.score

        if score is not None:
            if metadata is None:
                metadata = {}
            metadata["score"] = score

    # Parse document_type enum - allow undefined, NO GUESSING
    doc_type = props.get("document_type")
    doc_type_str = doc_type.strip().lower() if isinstance(doc_type, str) and doc_type else ""
    
    # If missing, set to None (undefined)
    if not doc_type_str:
        logger.warning(f"Missing document_type for document {props.get('document_id', 'unknown')} - will be displayed as undefined")
        document_type = None
    else:
        # Normalize common variations
        doc_type_str = doc_type_str.replace("judgement", "judgment")

        # Handle "tax interpretation" (with space) -> "tax_interpretation"
        if "tax interpretation" in doc_type_str:
            doc_type_str = doc_type_str.replace("tax interpretation", "tax_interpretation")
        # Only replace standalone "interpretation" if it's not already "tax_interpretation"
        elif doc_type_str == "interpretation":
            doc_type_str = "tax_interpretation"

        try:
            document_type = DocumentType(doc_type_str)
        except (ValueError, KeyError) as e:
            # If invalid, set to None (undefined) - NO GUESSING
            logger.warning(f"Invalid document_type '{doc_type_str}' for document {props.get('document_id', 'unknown')} - will be displayed as undefined")
            document_type = None

    return LegalDocument(
        # Required fields - use empty string as fallback (handle None explicitly for return_properties)
        document_id=props.get("document_id", ""),
        document_type=document_type,
        language=props.get("language"),  # No default - should be None if not present
        country=props.get("country", ""),
        full_text=props.get("full_text", ""),
        # Optional fields - use None for missing values
        title=get_opt_str("title"),
        date_issued=props.get("date_issued"),
        document_number=get_opt_str("document_number"),
        summary=get_opt_str("summary"),
        thesis=get_opt_str("thesis"),
        keywords=get_opt_list("keywords"),
        ingestion_date=props.get("ingestion_date"),
        last_updated=props.get("last_updated"),
        processing_status=get_opt_str("processing_status"),
        source_url=get_opt_str("source_url"),
        parties=get_opt_str("parties"),
        outcome=get_opt_str("outcome"),
        publication_date=props.get("publication_date"),
        raw_content=get_opt_str("raw_content"),
        presiding_judge=get_opt_str("presiding_judge"),
        judges=get_opt_list("judges"),
        legal_bases=get_opt_list("legal_bases"),
        court_name=get_opt_str("court_name"),
        department_name=get_opt_str("department_name"),
        extracted_legal_bases=get_opt_str("extracted_legal_bases"),
        references=get_opt_list("references"),
        metadata=metadata,
        vectors=obj.vector if include_vectors and hasattr(obj, "vector") else None,
        x=props.get("x"),
        y=props.get("y"),
    )


def convert_weaviate_obj_to_document_chunk(obj, confidence_score: Optional[float] = None, extract_score: bool = True) -> DocumentChunk:
    """Convert a Weaviate object to a DocumentChunk model.

    Handles optional fields safely - missing properties will be set to None or appropriate defaults.

    Args:
        obj: Weaviate object from query response
        confidence_score: Optional confidence score to use directly
        extract_score: If True and confidence_score is None, extract score from obj metadata

    Returns:
        DocumentChunk object
    """
    props = obj.properties if hasattr(obj, "properties") else {}

    # Get confidence score from metadata if not provided and extraction is enabled
    if confidence_score is None and extract_score:
        confidence_score = extract_score_from_obj(obj)

    # Helper to safely get optional fields
    def get_opt_str(key: str) -> Optional[str]:
        val = props.get(key)
        if val is None or val == "":
            return None
        return str(val)

    return DocumentChunk(
        # Required fields
        document_id=props.get("document_id", ""),
        chunk_id=props.get("chunk_id", 0),
        chunk_text=props.get("chunk_text", ""),
        # Optional fields
        document_type=get_opt_str("document_type"),
        language=get_opt_str("language"),
        position=props.get("position"),
        confidence_score=confidence_score,
        parent_segment_id=get_opt_str("parent_segment_id"),
    )


def get_chunk_score(chunk: Union[DocumentChunk, Any]) -> float:
    """Get confidence score from either DocumentChunk or Weaviate object.
    
    Args:
        chunk: Either a DocumentChunk object or Weaviate object
        
    Returns:
        Confidence score as float, or 0.0 if not available
    """
    if isinstance(chunk, DocumentChunk):
        return chunk.confidence_score or 0.0
    else:
        # Weaviate object
        return extract_score_from_obj(chunk) or 0.0


def get_chunk_document_id(chunk: Union[DocumentChunk, Any]) -> Optional[str]:
    """Get document_id from either DocumentChunk or Weaviate object.
    
    Args:
        chunk: Either a DocumentChunk object or Weaviate object
        
    Returns:
        Document ID as string, or None if not available
    """
    if isinstance(chunk, DocumentChunk):
        return chunk.document_id
    else:
        # Weaviate object
        return chunk.properties.get("document_id") if hasattr(chunk, "properties") else None


def parse_date(date_value: Any) -> Optional[datetime]:
    """Parse a date value from Weaviate (can be string, datetime, or None).

    Args:
        date_value: Date value from Weaviate (ISO string, datetime object, or None)

    Returns:
        Parsed datetime object or None
    """
    if date_value is None:
        return None

    # If it's already a datetime object, return it
    if isinstance(date_value, datetime):
        return date_value

    # If it's a string, try to parse it
    if isinstance(date_value, str):
        if not date_value.strip():
            return None
        try:
            # Try parsing ISO format
            return datetime.fromisoformat(date_value.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            try:
                # Try parsing common date formats
                return datetime.strptime(date_value, "%Y-%m-%dT%H:%M:%S")
            except (ValueError, AttributeError):
                logger.warning(f"Could not parse date: {date_value}")
                return None

    return None


def convert_weaviate_obj_to_legal_document_metadata(obj, score: Optional[float] = None) -> LegalDocumentMetadata:
    """Convert a Weaviate object to a LegalDocumentMetadata model (lightweight version).

    Includes required fields and extended fields for DocumentCard display.

    Args:
        obj: Weaviate object from query response
        score: Optional score to use. If not provided, extracts from obj.metadata.score or obj.score

    Returns:
        LegalDocumentMetadata object with required and extended fields
    """
    props = obj.properties if hasattr(obj, "properties") else {}

    # Get UUID from the object (always available on Weaviate objects)
    uuid_str = str(obj.uuid) if hasattr(obj, "uuid") else ""

    # Parse document_type enum - allow undefined, NO GUESSING
    doc_type = props.get("document_type")
    doc_type_str = doc_type.strip().lower() if isinstance(doc_type, str) and doc_type else ""
    
    # If missing, set to None (undefined)
    if not doc_type_str:
        logger.warning(f"Missing document_type for document UUID {uuid_str} - will be displayed as undefined")
        document_type = None
    else:
        # Normalize common variations
        doc_type_str = doc_type_str.replace("judgement", "judgment")

        # Handle "tax interpretation" (with space) -> "tax_interpretation"
        if "tax interpretation" in doc_type_str:
            doc_type_str = doc_type_str.replace("tax interpretation", "tax_interpretation")
        # Only replace standalone "interpretation" if it's not already "tax_interpretation"
        elif doc_type_str == "interpretation":
            doc_type_str = "tax_interpretation"

        try:
            document_type = DocumentType(doc_type_str)
        except (ValueError, KeyError) as e:
            # If invalid, set to None (undefined) - NO GUESSING
            logger.warning(f"Invalid document_type '{doc_type_str}' for document UUID {uuid_str} - will be displayed as undefined")
            document_type = None

    # Parse date_issued from string to datetime (optional field)
    date_issued = parse_date(props.get("date_issued"))

    # Extract score if not provided
    if score is None:
        score = extract_score_from_obj(obj)

    # Helper to safely get optional string fields
    def get_opt_str(key: str) -> Optional[str]:
        val = props.get(key)
        if val is None or val == "":
            return None
        return parse_string_property(val) if not isinstance(val, str) else val

    return LegalDocumentMetadata(
        uuid=uuid_str,
        document_id=props.get("document_id", ""),
        document_type=document_type,
        language=props.get("language"),  # No default - should be None if not present
        keywords=parse_list_property(props.get("keywords")),
        date_issued=date_issued,
        score=score,
        # Extended fields for DocumentCard display
        title=get_opt_str("title"),
        summary=get_opt_str("summary"),
        court_name=get_opt_str("court_name"),
        document_number=get_opt_str("document_number"),
        thesis=get_opt_str("thesis"),
    )


def extract_score_from_obj(obj: Any) -> Optional[float]:
    """Extract confidence_score from Weaviate object properties.
    
    Args:
        obj: Weaviate object from query response

    Returns:
        Confidence score value or None if not found
    """
    # Get confidence_score from object properties
    if hasattr(obj, "properties"):
        props = obj.properties
        if isinstance(props, dict) and "confidence_score" in props:
            score = props.get("confidence_score")
            if score is not None:
                return float(score)
    
    return None


def validate_uuids(document_uuids: list[str]) -> None:
    """Validate UUID format for a list of UUID strings.

    Args:
        document_uuids: List of UUID strings to validate

    Raises:
        ValueError: If any UUIDs have invalid format
    """
    invalid_uuids = []
    for uuid_str in document_uuids:
        try:
            uuid.UUID(uuid_str)
        except (ValueError, TypeError):
            invalid_uuids.append(uuid_str)

    if invalid_uuids:
        raise ValueError(f"Invalid UUID format(s): {invalid_uuids[:MAX_INVALID_UUIDS_TO_SHOW]}")


# RRF functionality moved to aggregation.py
# Import here for backward compatibility
from ai_tax_search.retrieval.aggregation import reciprocal_rank_fusion


def validate_search_parameters(
    limit_docs: int,
    chunks_per_doc_multiplier: int,
    limit_chunks: Optional[int],
    alpha: float,
    mode: str,
) -> int:
    """Validate search parameters and calculate limit_chunks if needed.
    
    Args:
        limit_docs: Number of unique documents to return
        chunks_per_doc_multiplier: Multiplier for calculating limit_chunks
        limit_chunks: Number of raw chunks to fetch (None to calculate)
        alpha: Hybrid search balance (0.0-1.0)
        mode: Search mode ("rabbit" or "thinking")
        
    Returns:
        Calculated or validated limit_chunks value
        
    Raises:
        ValueError: If any parameter is invalid
    """
    if limit_docs <= 0:
        raise ValueError("limit_docs must be positive")
    if chunks_per_doc_multiplier <= 0:
        raise ValueError("chunks_per_doc_multiplier must be positive")
    
    # Validate alpha parameter range
    if alpha < 0.0 or alpha > 1.0:
        raise ValueError(f"alpha must be between 0.0 and 1.0, got {alpha}")
    
    # Validate mode parameter
    if mode not in ("rabbit", "thinking"):
        raise ValueError(f"mode must be 'rabbit' or 'thinking', got {mode}")
    
    # Calculate limit_chunks if not provided
    if limit_chunks is None:
        limit_chunks = limit_docs * chunks_per_doc_multiplier
    
    if limit_chunks <= 0:
        raise ValueError("limit_chunks must be positive")
    
    return limit_chunks


def group_chunks_by_document(
    chunks: list[Union[DocumentChunk, Any]],
    limit_docs: int,
) -> OrderedDict[str, Union[DocumentChunk, Any]]:
    """Group chunks by document_id, keeping only the best chunk per document.
    
    Chunks should be pre-sorted by relevance (RRF score or Weaviate score).
    The first occurrence of each document_id is kept as the best chunk.
    
    Args:
        chunks: List of chunks (DocumentChunk or Weaviate objects), pre-sorted by relevance
        limit_docs: Maximum number of unique documents to return
        
    Returns:
        OrderedDict mapping document_id to best chunk (stops at limit_docs)
    """
    doc_to_chunk: OrderedDict[str, Union[DocumentChunk, Any]] = OrderedDict()
    
    for chunk in chunks:
        if len(doc_to_chunk) >= limit_docs:
            break
        
        doc_id = get_chunk_document_id(chunk)
        if not doc_id:
            continue
        
        # Skip if document_id already exists (we already have the best chunk for this doc)
        if doc_id not in doc_to_chunk:
            doc_to_chunk[doc_id] = chunk
    
    return doc_to_chunk


def convert_mixed_chunks_to_document_chunks(
    chunks: OrderedDict[str, Union[DocumentChunk, Any]]
) -> list[DocumentChunk]:
    """Convert mixed chunk types (DocumentChunk or Weaviate objects) to DocumentChunk objects.
    
    Args:
        chunks: OrderedDict of chunks (may be DocumentChunk or Weaviate objects)
        
    Returns:
        List of DocumentChunk objects
    """
    result = []
    for item in chunks.values():
        if isinstance(item, DocumentChunk):
            # Already a DocumentChunk (thinking mode), just use it
            if item.confidence_score is None:
                logger.warning(
                    f"DocumentChunk {item.chunk_id} (doc: {item.document_id}) has None confidence_score!"
                )
            result.append(item)
        else:
            # Weaviate object (rabbit mode), convert it
            # Use confidence_score from properties if available, otherwise try to extract from metadata
            props = item.properties if hasattr(item, "properties") else {}
            confidence_score = props.get("confidence_score")
            
            # Only try to extract from metadata if confidence_score is not in properties
            if confidence_score is None:
                confidence_score = extract_score_from_obj(item)
            
            # If still None, use 0.0 as fallback (don't log warning - confidence_score may legitimately be None)
            if confidence_score is None:
                confidence_score = 0.0
            
            result.append(convert_weaviate_obj_to_document_chunk(item, confidence_score, extract_score=False))
    
    return result


def build_timing_details(
    query_time_ms: float,
    grouping_time_ms: float,
    conversion_time_ms: float,
    total_time_ms: float,
) -> dict[str, float]:
    """Build timing breakdown dictionary.
    
    Args:
        query_time_ms: Query execution time in milliseconds
        grouping_time_ms: Grouping time in milliseconds
        conversion_time_ms: Conversion time in milliseconds
        total_time_ms: Total time in milliseconds
        
    Returns:
        Dictionary with timing breakdown
    """
    return {
        "query_ms": query_time_ms,
        "grouping_ms": grouping_time_ms,
        "selection_ms": 0.0,  # No selection step needed
        "conversion_ms": conversion_time_ms,
        "python_postprocessing_ms": grouping_time_ms + conversion_time_ms,
        "total_ms": total_time_ms,
    }


def create_empty_timing_details(query_time_ms: float, total_time_ms: float) -> dict[str, float]:
    """Create timing details for empty results.
    
    Args:
        query_time_ms: Query execution time in milliseconds
        total_time_ms: Total time in milliseconds
        
    Returns:
        Dictionary with timing breakdown (all post-processing times are 0)
    """
    return {
        "query_ms": query_time_ms,
        "grouping_ms": 0.0,
        "selection_ms": 0.0,
        "conversion_ms": 0.0,
        "python_postprocessing_ms": 0.0,
        "total_ms": total_time_ms,
    }

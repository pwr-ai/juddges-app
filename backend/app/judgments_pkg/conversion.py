"""Document type conversion functions."""

from datetime import datetime
from typing import Any

from juddges_search.models import DocumentType, IssuingBody, LegalDocument

from app.utils.date_utils import parse_date


def _convert_judgment_to_legal_document(
    judgment_data: dict[str, Any],
    include_vectors: bool = False,
) -> LegalDocument:
    """Convert judgment table data to LegalDocument model.

    Args:
        judgment_data: Dictionary from judgments table query
        include_vectors: Whether to include vector embeddings

    Returns:
        LegalDocument model instance
    """
    # Map jurisdiction to country code
    country = judgment_data.get("jurisdiction", "PL")

    # Parse dates
    date_issued = parse_date(judgment_data.get("decision_date"))
    publication_date = parse_date(judgment_data.get("publication_date"))

    # Build issuing body from court information
    issuing_body = None
    court_name = judgment_data.get("court_name")
    if court_name:
        issuing_body = IssuingBody(
            name=court_name,
            court_level=judgment_data.get("court_level"),
            country=country,
        )

    # Build vectors dict if requested
    vectors = {}
    if include_vectors and judgment_data.get("embedding"):
        vectors["default"] = judgment_data["embedding"]

    # Get metadata from JSONB field and merge with judgment fields
    metadata = judgment_data.get("metadata", {}) or {}
    if isinstance(metadata, dict):
        # Add judgment-specific fields to metadata
        if judgment_data.get("case_type"):
            metadata["case_type"] = judgment_data["case_type"]
        if judgment_data.get("decision_type"):
            metadata["decision_type"] = judgment_data["decision_type"]

    return LegalDocument(
        document_id=str(judgment_data.get("id", "")),  # Use UUID as document_id
        document_type=DocumentType.JUDGMENT,
        title=judgment_data.get("title"),
        date_issued=date_issued,
        issuing_body=issuing_body,
        language=metadata.get("language", "pl" if country == "PL" else "en"),
        document_number=judgment_data.get("case_number"),
        country=country,
        full_text=judgment_data.get("full_text", ""),
        summary=judgment_data.get("summary"),
        keywords=judgment_data.get("keywords") or [],
        metadata=metadata,
        vectors=vectors,
        outcome=judgment_data.get("outcome"),
        publication_date=publication_date,
        judges=judgment_data.get("judges") or [],
        legal_bases=judgment_data.get("cited_legislation") or [],
        court_name=court_name,
        source_url=judgment_data.get("source_url"),
        references=judgment_data.get("legal_topics")
        or [],  # Map legal_topics to references
    )


def _convert_supabase_to_legal_document(
    doc_data: dict[str, Any],
    include_vectors: bool = False,
) -> LegalDocument:
    """Convert Supabase document data to LegalDocument model.

    Args:
        doc_data: Dictionary from Supabase query
        include_vectors: Whether to include vector embeddings

    Returns:
        LegalDocument model instance
    """
    # Parse document type
    doc_type_str = doc_data.get("document_type", "judgment")
    try:
        doc_type = DocumentType(doc_type_str)
    except ValueError:
        doc_type = DocumentType.JUDGMENT

    # Parse issuing body
    issuing_body = None
    issuing_body_data = doc_data.get("issuing_body")
    if issuing_body_data and isinstance(issuing_body_data, dict):
        issuing_body = IssuingBody(**issuing_body_data)

    # Parse dates using utility function
    date_issued = parse_date(doc_data.get("date_issued"))
    publication_date = parse_date(doc_data.get("publication_date"))
    ingestion_date = parse_date(doc_data.get("ingestion_date"))
    last_updated = parse_date(doc_data.get("last_updated"))

    # Build vectors dict if requested
    vectors = {}
    if include_vectors:
        if doc_data.get("embedding"):
            vectors["default"] = doc_data["embedding"]
        if doc_data.get("summary_embedding"):
            vectors["summary"] = doc_data["summary_embedding"]

    return LegalDocument(
        document_id=doc_data.get("document_id", ""),
        document_type=doc_type,
        title=doc_data.get("title"),
        date_issued=date_issued,
        issuing_body=issuing_body,
        language=doc_data.get("language"),
        document_number=doc_data.get("document_number"),
        country=doc_data.get("country", "PL"),
        full_text=doc_data.get("full_text", ""),
        summary=doc_data.get("summary"),
        keywords=doc_data.get("keywords") or [],
        metadata=doc_data.get("metadata") or {},
        vectors=vectors,
        x=doc_data.get("x"),
        y=doc_data.get("y"),
        thesis=doc_data.get("thesis"),
        ingestion_date=ingestion_date,
        last_updated=last_updated,
        processing_status=doc_data.get("processing_status"),
        source_url=doc_data.get("source_url"),
        parties=doc_data.get("parties"),
        outcome=doc_data.get("outcome"),
        publication_date=publication_date,
        raw_content=doc_data.get("raw_content"),
        presiding_judge=doc_data.get("presiding_judge"),
        judges=doc_data.get("judges") or [],
        legal_bases=doc_data.get("legal_bases") or [],
        court_name=doc_data.get("court_name"),
        department_name=doc_data.get("department_name"),
        extracted_legal_bases=doc_data.get("extracted_legal_bases"),
        references=doc_data.get("references") or [],
    )


def _build_document_metadata_dict(doc: LegalDocument) -> dict:
    """Build metadata dictionary from document, excluding full text and HTML content."""
    metadata = {
        "document_id": doc.document_id,
        "title": doc.title,
        "document_type": doc.document_type,
        "date_issued": doc.date_issued.isoformat() if doc.date_issued else None,
        "document_number": doc.document_number,
        "language": doc.language,
        "country": doc.country,
        "summary": doc.summary,
        "keywords": doc.keywords,
        "x": doc.x,
        "y": doc.y,
        "thesis": doc.thesis,
        "ingestion_date": doc.ingestion_date.isoformat()
        if doc.ingestion_date
        else None,
        "last_updated": doc.last_updated.isoformat() if doc.last_updated else None,
        "processing_status": doc.processing_status,
        "source_url": doc.source_url,
        "parties": doc.parties,
        "outcome": doc.outcome,
        "publication_date": doc.publication_date.isoformat()
        if doc.publication_date
        else None,
        "presiding_judge": doc.presiding_judge,
        "judges": doc.judges,
        "legal_bases": doc.legal_bases,
        "court_name": doc.court_name,
        "department_name": doc.department_name,
        "extracted_legal_bases": doc.extracted_legal_bases,
        "references": doc.references,
        "issuing_body": doc.issuing_body.model_dump() if doc.issuing_body else None,
    }

    # Merge nested metadata dict if it exists
    if doc.metadata and isinstance(doc.metadata, dict):
        exclude_fields = {
            "html",
            "html_content",
            "raw_html",
            "full_text",
            "raw_content",
        }
        for key, value in doc.metadata.items():
            key_lower = key.lower()
            if key_lower in exclude_fields or "chunk" in key_lower:
                continue
            if key not in metadata or metadata[key] is None:
                if isinstance(value, datetime):
                    metadata[key] = value.isoformat()
                else:
                    metadata[key] = value

    return metadata

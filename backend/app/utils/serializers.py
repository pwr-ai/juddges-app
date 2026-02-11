"""Serialization utility functions for document responses."""

from juddges_search.models import LegalDocument
from app.utils.date_utils import serialize_date


def serialize_document_for_similarity(doc: LegalDocument) -> dict:
    """
    Serialize a LegalDocument for similarity search results.

    Handles date serialization and document_type enum conversion.

    Args:
        doc: LegalDocument instance to serialize

    Returns:
        Dictionary with serialized document fields for similarity results
    """
    # Serialize dates using utility function
    date_issued_str = serialize_date(doc.date_issued)
    publication_date_str = serialize_date(doc.publication_date)

    # Serialize document_type if it's an enum
    document_type_str = None
    if doc.document_type:
        if hasattr(doc.document_type, "value"):
            document_type_str = doc.document_type.value
        else:
            document_type_str = str(doc.document_type)

    return {
        "document_id": doc.document_id,
        "title": doc.title,
        "document_type": document_type_str,
        "date_issued": date_issued_str,
        "publication_date": publication_date_str,
        "document_number": doc.document_number,
        "country": doc.country,
        "language": doc.language,
    }


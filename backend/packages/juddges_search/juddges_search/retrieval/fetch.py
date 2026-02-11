"""Direct document fetch operations by identifier (ID or UUID).

DEPRECATED: This module previously used Weaviate for document retrieval.
All vector search now uses Supabase pgvector.

For document fetching, use:
    from app.utils.document_fetcher import get_documents_by_id
"""

from typing import Optional
from loguru import logger
from juddges_search.models import LegalDocument

import warnings
warnings.warn(
    "juddges_search.retrieval.fetch is deprecated. "
    "Use app.utils.document_fetcher.get_documents_by_id instead.",
    DeprecationWarning,
    stacklevel=2
)



async def get_documents_by_id(
    document_ids: list[str],
    return_vectors: bool = False,
    return_properties: Optional[list[str]] = None
) -> list[LegalDocument]:
    """DEPRECATED: Use app.utils.document_fetcher.get_documents_by_id instead.

    This function is kept for backwards compatibility but will be removed in a future version.
    """
    raise NotImplementedError(
        "Weaviate-based document retrieval has been removed. "
        "Use app.utils.document_fetcher.get_documents_by_id instead."
    )


async def get_documents_by_uuid(
    document_uuids: list[str],
    return_vectors: bool = False,
    include_scores: bool = False,
    return_properties: Optional[list[str]] = None,
) -> list[LegalDocument]:
    """DEPRECATED: Use app.utils.document_fetcher.get_documents_by_id instead.

    This function is kept for backwards compatibility but will be removed in a future version.
    UUIDs are Weaviate-specific and not used with Supabase.
    """
    raise NotImplementedError(
        "Weaviate UUID-based retrieval has been removed. "
        "Use app.utils.document_fetcher.get_documents_by_id with document IDs instead."
    )

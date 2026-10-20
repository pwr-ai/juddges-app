"""
Document search and retrieval API endpoints using Supabase pgvector.

This package provides:
- Document listing and sampling
- Semantic search using vector embeddings
- Hybrid search (vector + full-text + filters)
- Document retrieval by ID
- Similar document discovery
"""

from __future__ import annotations

import random
import time
from typing import TYPE_CHECKING

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
    Path,
    Query,
    Request,
    Response,
)
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

if TYPE_CHECKING:
    from juddges_search.models import LegalDocument

from app.config import settings
from app.models import (
    BatchDocumentsRequest,
    BatchDocumentsResponse,
    CitationNetworkResponse,
    CitationNetworkStatistics,
    DocumentRequest,
    DocumentResponse,
    DocumentRetrievalRequest,
    DocumentRetrievalResponse,
    FacetsResponse,
    SearchChunksRequest,
    SearchChunksResponse,
    SimilarDocumentsRequest,
    SimilarDocumentsResponse,
    validate_id_format,
)
from app.services.audit_service import AuditService, audited_principal
from app.utils import (
    validate_array_size,
)

# Re-export public API used by other modules
from .citation import (
    _build_citation_edges,
    _build_citation_nodes,
    _build_citation_statistics,
    _build_ref_index,
    _calc_authority_scores,
)
from .conversion import (
    _build_document_metadata_dict,
    _convert_judgment_to_legal_document,
    _convert_supabase_to_legal_document,
    _extract_base_fields,
    _extract_extraction_fields,
    _merge_base_extraction_fields,
)
from .search import (
    _build_search_pagination,
    _build_search_result_payload,
    _build_search_rpc_params,
    _build_search_timing_breakdown,
    _generate_search_embedding,
    _get_estimated_total,
    _get_search_client,
    _prepare_search_queries,
    _rerank_if_enabled,
    _route_effective_alpha,
    _run_hybrid_search,
    _run_zero_result_fallbacks,
    _validate_search_query,
    run_document_search,
)
from .similarity import find_similar_documents_batch as _find_similar_documents_batch
from .similarity import get_similar_to_document
from .utils import (
    _detect_search_language,
    _get_cached_document_ids,
    generate_embedding,
)

router = APIRouter(prefix="/documents", tags=["documents"])

# Mount the LLM query-rewrite sub-router under /documents (final path:
# /documents/search/rewrite). Imported here (not at the module top) to avoid
# any chance of a circular import via app.services.search.
from app.judgments_pkg.query_rewrite import (  # noqa: E402
    router as _query_rewrite_router,
)

router.include_router(_query_rewrite_router)

# Make key symbols available at package level for external importers
__all__ = [
    "_convert_judgment_to_legal_document",
    "_convert_supabase_to_legal_document",
    "_detect_search_language",
    "find_similar_documents_batch",
    "generate_embedding",
    "router",
    "search_documents",
]


def _audit_document_view(
    request: Request,
    background_tasks: BackgroundTasks,
    document_id: str,
) -> None:
    """Record a judgment read in the compliance trail (issue #559).

    These endpoints carry no JWT dependency because judgments are public court
    rulings (#510 / #561); attribution comes from the `X-User-ID` header the
    Next.js BFF injects behind the server-only API key. A signed-out visitor
    arrives as the reserved `anonymous` principal and is deliberately not
    audited — `audited_principal` returns None and nothing is written.

    Call this only once the document is known to exist, so a 404 probe cannot
    manufacture a "viewed" entry.
    """
    user_id = audited_principal(request)
    if user_id is None:
        return
    background_tasks.add_task(
        AuditService.log_document_access,
        user_id=user_id,
        document_id=document_id,
        action="view",
    )


# ===== GET Endpoints =====


@router.get(
    "",
    response_model=BatchDocumentsResponse,
    summary="List documents",
    description="List documents with optional filters. Returns a sample.",
)
async def list_documents(
    limit: int = Query(20, ge=1, le=100, description="Number of documents to return"),
    return_vectors: bool = Query(False, description="Include vector embeddings"),
    only_with_coordinates: bool = Query(
        True, description="Only documents with x,y coordinates"
    ),
) -> BatchDocumentsResponse:
    """List documents with optional filters."""
    all_document_ids = await _get_cached_document_ids(
        only_with_coordinates=only_with_coordinates
    )

    if not all_document_ids:
        return BatchDocumentsResponse(documents=[])

    sample_size = min(limit, len(all_document_ids))
    sampled_ids = random.sample(all_document_ids, sample_size)

    db = get_vector_db()
    # List view never renders the body — skip full_text to trim the payload.
    docs_data = await db.get_documents_by_ids(sampled_ids, include_full_text=False)

    documents = [
        _convert_supabase_to_legal_document(doc, include_vectors=return_vectors)
        for doc in docs_data
    ]

    return BatchDocumentsResponse(documents=documents)


@router.get("/sample", response_model=BatchDocumentsResponse)
async def get_documents_sample(
    sample_size: int = Query(
        settings.DEFAULT_SAMPLE_SIZE,
        ge=1,
        le=settings.MAX_SAMPLE_SIZE,
        description="Number of documents to sample",
    ),
    return_vectors: bool = Query(
        False, description="Whether to include vector embeddings"
    ),
    only_with_coordinates: bool = Query(
        True, description="Only return documents with x,y coordinates"
    ),
):
    """Get a random sample of documents for visualization."""
    all_document_ids = await _get_cached_document_ids(
        only_with_coordinates=only_with_coordinates
    )

    if not all_document_ids:
        detail = (
            "No documents with coordinates found"
            if only_with_coordinates
            else "No documents found"
        )
        raise HTTPException(status_code=404, detail=detail)

    sample_size = min(sample_size, len(all_document_ids))
    sampled_ids = random.sample(all_document_ids, sample_size)

    db = get_vector_db()
    # Visualization sample never renders the body — skip full_text.
    docs_data = await db.get_documents_by_ids(sampled_ids, include_full_text=False)

    documents = [
        _convert_supabase_to_legal_document(doc, include_vectors=return_vectors)
        for doc in docs_data
    ]

    return BatchDocumentsResponse(documents=documents)


@router.get(
    "/citation-network",
    response_model=CitationNetworkResponse,
    summary="Get citation network data",
    description="Build a citation network showing shared legal references between documents.",
)
async def get_citation_network(
    sample_size: int = Query(
        50, ge=1, le=200, description="Number of documents to include"
    ),
    min_shared_refs: int = Query(
        1, ge=1, le=10, description="Minimum shared references for an edge"
    ),
) -> CitationNetworkResponse:
    """Build citation network from shared legal references between documents."""
    try:
        db = get_vector_db()

        # Alias the `judgments` columns onto the legacy names the citation
        # network builders read. `references` maps to `legal_topics`, matching
        # `_convert_supabase_to_legal_document`; `x`/`y` are the UMAP coords.
        query = db.client.table("judgments").select(
            "document_id:id, title, document_type:decision_type, "
            "date_issued:decision_date, x:umap_x, y:umap_y, "
            "references:legal_topics, court_name, document_number:case_number, "
            "language:metadata->>language"
        )

        # Filters must use the physical column name, not the alias.
        response = query.not_.is_("legal_topics", "null").limit(sample_size).execute()
        docs = response.data or []
        docs = [d for d in docs if d.get("references") and len(d["references"]) > 0]

        if not docs:
            return CitationNetworkResponse(
                nodes=[],
                edges=[],
                statistics=CitationNetworkStatistics(
                    total_nodes=0,
                    total_edges=0,
                    avg_citations=0.0,
                    max_citations=0,
                    most_cited_refs=[],
                    avg_authority_score=0.0,
                ),
            )

        ref_to_docs, doc_refs, _ = _build_ref_index(docs)
        authority_scores = _calc_authority_scores(docs, doc_refs, ref_to_docs)
        nodes = _build_citation_nodes(docs, doc_refs, authority_scores)
        edges = _build_citation_edges(docs, doc_refs, min_shared_refs)
        statistics = _build_citation_statistics(
            docs, ref_to_docs, authority_scores, nodes, edges
        )

        return CitationNetworkResponse(nodes=nodes, edges=edges, statistics=statistics)

    except Exception as e:
        logger.exception(f"Error building citation network: {e!s}")
        raise HTTPException(status_code=500, detail="Error building citation network")


@router.get(
    "/facets",
    response_model=FacetsResponse,
    summary="Get facet counts for filters",
)
async def get_facets(
    jurisdiction: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """
    Get aggregated counts for each filter option (facets).

    Used to display filter counts in UI, e.g., "Criminal (234)" or "Supreme Court (45)".
    Supports optional pre-filtering by jurisdiction and date range.

    Args:
        jurisdiction: Optional jurisdiction filter (PL or UK)
        date_from: Optional start date filter (YYYY-MM-DD)
        date_to: Optional end date filter (YYYY-MM-DD)

    Returns:
        Facets grouped by type with counts for each value
    """
    try:
        from app.core.supabase import get_supabase_client

        supabase = get_supabase_client()

        if not supabase:
            raise HTTPException(
                status_code=500, detail="Database client not initialized"
            )

        response = supabase.rpc(
            "get_judgment_facets",
            {
                "pre_filter_jurisdictions": [jurisdiction] if jurisdiction else None,
                "pre_filter_date_from": date_from,
                "pre_filter_date_to": date_to,
            },
        ).execute()

        grouped_facets: dict[str, list] = {}
        for row in response.data or []:
            facet_type = row["facet_type"]
            if facet_type not in grouped_facets:
                grouped_facets[facet_type] = []
            grouped_facets[facet_type].append(
                {"value": row["facet_value"], "count": row["facet_count"]}
            )

        logger.info(f"Retrieved facets: {len(grouped_facets)} facet types")
        return FacetsResponse(facets=grouped_facets)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Facets retrieval error: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to get facets: {e!s}")


@router.get(
    "/{document_id}/metadata",
    response_model=dict,
    summary="Get document metadata only",
)
async def get_document_metadata(
    request: Request,
    background_tasks: BackgroundTasks,
    document_id: str = Path(..., description="Document ID to retrieve metadata for"),
) -> dict:
    """Get document metadata without full text content."""
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        db = get_vector_db()
        doc_data = await db.get_document_by_id(document_id)

        if not doc_data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        doc = _convert_supabase_to_legal_document(doc_data)
        result = _build_document_metadata_dict(doc)
        # Surface base_* extracted-schema columns (Number of Victims,
        # Appellant, Appeal Outcome, …) only on this endpoint — search/list
        # responses don't need the bloat.
        _merge_base_extraction_fields(result, doc_data)
        _audit_document_view(request, background_tasks, document_id)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving document metadata {document_id}: {e!s}")
        raise HTTPException(
            status_code=500, detail="Error retrieving document metadata."
        )


@router.get(
    "/{document_id}/similar",
    response_model=SimilarDocumentsResponse,
    summary="Find similar documents to one document",
)
async def get_similar_to_document_endpoint(
    document_id: str = Path(
        ..., description="Document ID to find similar documents for"
    ),
    top_k: int = Query(
        10, ge=1, le=100, description="Maximum number of similar documents"
    ),
) -> SimilarDocumentsResponse:
    """Find documents similar to a specific document using vector similarity."""
    return await get_similar_to_document(document_id=document_id, top_k=top_k)


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document by ID",
)
async def get_document_by_id(
    request: Request,
    background_tasks: BackgroundTasks,
    document_id: str = Path(..., description="Document ID to retrieve"),
    return_vectors: bool = Query(False, description="Include vector embeddings"),
    include_base_fields: bool = Query(
        False,
        description=(
            "Include extracted base_* schema columns under `base_fields` and "
            "structure_*/deep_* extraction columns under `extraction_fields`"
        ),
    ),
) -> DocumentResponse:
    """Get a document by its ID."""
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        db = get_vector_db()
        doc_data = await db.get_document_by_id(document_id)

        if not doc_data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        document = _convert_supabase_to_legal_document(
            doc_data, include_vectors=return_vectors
        )
        if include_base_fields:
            document.base_fields = _extract_base_fields(doc_data)
            document.extraction_fields = _extract_extraction_fields(doc_data)
        _audit_document_view(request, background_tasks, document_id)
        return DocumentResponse(document=document)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving document {document_id}: {e!s}")
        raise HTTPException(status_code=500, detail="Error retrieving document.")


# ===== POST Endpoints - Batch/Retrieval =====


@router.post(
    "",
    response_model=DocumentResponse,
    deprecated=True,
    summary="Get document by ID (deprecated)",
)
async def get_document_by_id_legacy(
    request: DocumentRequest, response: Response
) -> DocumentResponse:
    """Legacy endpoint. Use GET /documents/{document_id} instead."""
    response.headers["Sunset"] = "Sat, 30 Nov 2025 23:59:59 GMT"
    response.headers["Deprecation"] = "true"
    response.headers["Link"] = '</documents/{id}>; rel="successor-version"'

    try:
        validate_id_format(request.document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db = get_vector_db()
    doc_data = await db.get_document_by_id(request.document_id)

    if not doc_data:
        raise HTTPException(
            status_code=404, detail=f"Document {request.document_id} not found"
        )

    document = _convert_supabase_to_legal_document(
        doc_data, include_vectors=request.return_vectors
    )
    if request.include_base_fields:
        document.base_fields = _extract_base_fields(doc_data)
        document.extraction_fields = _extract_extraction_fields(doc_data)
    return DocumentResponse(document=document)


@router.post(
    "/batch",
    response_model=BatchDocumentsResponse,
    summary="Get documents by IDs",
)
async def get_documents_batch(request: BatchDocumentsRequest):
    """Retrieve multiple documents by their IDs in a single request."""
    try:
        validate_array_size(
            request.document_ids, settings.MAX_BATCH_DOCUMENT_IDS, "document_ids"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    for doc_id in request.document_ids:
        if not doc_id or not doc_id.strip():
            raise HTTPException(status_code=400, detail="document_id cannot be empty")
        if len(doc_id) > 500:
            raise HTTPException(
                status_code=400, detail="document_id exceeds maximum length"
            )

    db = get_vector_db()
    docs_data = await db.get_documents_by_ids(request.document_ids)

    documents: list[LegalDocument] = []
    for doc in docs_data:
        converted = _convert_supabase_to_legal_document(
            doc, include_vectors=request.return_vectors
        )
        if request.include_base_fields:
            converted.base_fields = _extract_base_fields(doc)
            converted.extraction_fields = _extract_extraction_fields(doc)
        documents.append(converted)

    return BatchDocumentsResponse(documents=documents)


# ===== POST Endpoints - Search =====


@router.post(
    "/search",
    response_model=SearchChunksResponse,
    summary="Search documents using vector similarity",
)
async def search_documents(request: SearchChunksRequest):
    """
    Search documents using hybrid search (vector + full-text + filters).

    This endpoint:
    1. Generates an embedding for the query text
    2. Performs hybrid search combining vector similarity and full-text search
    3. Applies comprehensive filters (jurisdiction, court, case type, date, etc.)
    4. Returns matching documents with relevance scores

    Facets-only fast path: when ``request.facets`` is provided, the handler
    skips the pgvector pipeline entirely and proxies a thin Meilisearch
    ``/search`` call so the caller (e.g. the tag-array autocomplete) can
    fetch ``facetDistribution`` / ``facetStats`` without paying for the
    full document search.
    """
    return await run_document_search(request)


@router.post(
    "/search/legacy",
    response_model=DocumentRetrievalResponse,
    summary="Legacy search endpoint",
)
async def search_documents_legacy(request: DocumentRetrievalRequest):
    """Legacy search endpoint for backward compatibility."""
    # Convert to new format and call the main search
    new_request = SearchChunksRequest(
        query=request.question,
        mode=request.mode,
        limit_docs=20,
        api_version="enhanced",
    )

    result = await search_documents(new_request)

    return DocumentRetrievalResponse(
        question=request.question,
        question_rewritten=None,
        chunks=result.chunks,
        documents=result.documents,
        pagination=result.pagination,
    )


# ===== POST Endpoints - Similar Documents =====


@router.post(
    "/similar",
    response_model=list[SimilarDocumentsResponse],
    summary="Find similar documents (batch)",
)
async def find_similar_documents_batch(request: SimilarDocumentsRequest):
    """Find similar documents for multiple document IDs."""
    try:
        return await _find_similar_documents_batch(
            document_ids=request.document_ids,
            top_k=request.top_k,
        )
    except Exception as e:
        logger.error(f"Error finding similar documents: {e!s}")
        raise HTTPException(
            status_code=500, detail=f"Error finding similar documents: {e!s}"
        )


# ===== Utility Endpoints =====


@router.get("/stats/embeddings", summary="Get embedding statistics")
async def get_embedding_stats():
    """Get statistics about embedding coverage in the database."""
    try:
        db = get_vector_db()
        return await db.get_embedding_stats()
    except Exception as e:
        logger.error(f"Error getting embedding stats: {e!s}")
        raise HTTPException(
            status_code=500, detail="Error getting embedding statistics"
        )

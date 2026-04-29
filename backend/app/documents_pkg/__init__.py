"""
Document search and retrieval API endpoints using Supabase pgvector.

This package provides:
- Document listing and sampling
- Semantic search using vector embeddings
- Hybrid search (vector + full-text + filters)
- Document retrieval by ID
- Similar document discovery
"""

import random
import time

from fastapi import APIRouter, HTTPException, Path, Query, Response
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

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
)
from .search import (
    _build_search_pagination,
    _build_search_result_payload,
    _build_search_rpc_params,
    _build_search_timing_breakdown,
    _generate_search_embedding,
    _get_search_client,
    _prepare_search_queries,
    _rerank_if_enabled,
    _route_effective_alpha,
    _run_hybrid_search,
    _run_zero_result_fallbacks,
    _validate_search_query,
)
from .similarity import find_similar_documents_batch as _find_similar_documents_batch
from .similarity import get_similar_to_document
from .utils import (
    _detect_search_language,
    _get_cached_document_ids,
    generate_embedding,
)

router = APIRouter(prefix="/documents", tags=["documents"])

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
    docs_data = await db.get_documents_by_ids(sampled_ids)

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
    docs_data = await db.get_documents_by_ids(sampled_ids)

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
    document_types: str | None = Query(
        None, description="Comma-separated document types to filter"
    ),
) -> CitationNetworkResponse:
    """Build citation network from shared legal references between documents."""
    try:
        db = get_vector_db()

        query = db.client.table("legal_documents").select(
            'document_id, title, document_type, date_issued, x, y, "references", court_name, document_number, language'
        )

        if document_types:
            types_list = [t.strip() for t in document_types.split(",")]
            if len(types_list) == 1:
                query = query.eq("document_type", types_list[0])
            else:
                query = query.in_("document_type", types_list)

        response = query.not_.is_("references", "null").limit(sample_size).execute()
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
        logger.error(f"Error building citation network: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error building citation network")


@router.get(
    "/{document_id}/metadata",
    response_model=dict,
    summary="Get document metadata only",
)
async def get_document_metadata(
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
        return _build_document_metadata_dict(doc)

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
    document_id: str = Path(..., description="Document ID to retrieve"),
    return_vectors: bool = Query(False, description="Include vector embeddings"),
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

    documents = [
        _convert_supabase_to_legal_document(doc, include_vectors=request.return_vectors)
        for doc in docs_data
    ]

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
    """
    start_time = time.perf_counter()
    query = request.query
    _validate_search_query(query)
    limit = request.limit_docs or 20
    offset = request.offset or 0

    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category="search",
            message="documents.search called",
            data={"query_len": len(query), "limit": limit, "mode": request.mode},
            level="info",
        )
    except Exception:
        pass

    logger.info(
        f"Search request: query='{query[:100]}...', limit={limit}, "
        f"languages={request.languages}, document_types={request.document_types}, "
        f"jurisdictions={request.jurisdictions}, case_types={request.case_types}"
    )

    try:
        (
            semantic_query,
            keyword_query,
            enhanced_query_text,
            inferred_filters,
            enhancement_time_ms,
            query_analysis_source,
            effective_filters,
        ) = await _prepare_search_queries(request, query)

        query_type, effective_alpha, alpha_was_routed = _route_effective_alpha(
            query, request.alpha
        )
        (
            query_embedding,
            embedding_time_ms,
            vector_fallback,
        ) = await _generate_search_embedding(semantic_query, effective_alpha)

        search_language = _detect_search_language(
            keyword_query, request.languages, effective_filters["jurisdictions"]
        )
        rpc_params = _build_search_rpc_params(
            query_embedding=query_embedding,
            keyword_query=keyword_query,
            search_language=search_language,
            effective_filters=effective_filters,
            effective_alpha=effective_alpha,
            limit=limit,
            offset=offset,
            query_type=query_type,
        )
        supabase = await _get_search_client()
        results, search_time_ms = await _run_hybrid_search(supabase, rpc_params)
        fallback_time_ms = 0.0
        fallback_used = False
        fallback_stage: str | None = None

        if request.mode == "thinking" and not results:
            (
                results,
                fallback_time_ms,
                fallback_used,
                fallback_stage,
                fallback_query,
                vector_fallback,
            ) = await _run_zero_result_fallbacks(
                request=request,
                query=query,
                semantic_query=semantic_query,
                keyword_query=keyword_query,
                search_language=search_language,
                effective_alpha=effective_alpha,
                initial_query_embedding=query_embedding,
                supabase=supabase,
                limit=limit,
                offset=offset,
                vector_fallback=vector_fallback,
            )
            search_time_ms += fallback_time_ms
            if fallback_query:
                enhanced_query_text = fallback_query

        results, rerank_time_ms = await _rerank_if_enabled(query, results, top_k=limit)
        chunks, documents = _build_search_result_payload(results)

        total_time_ms = (time.perf_counter() - start_time) * 1000
        timing_breakdown = _build_search_timing_breakdown(
            mode=request.mode,
            enhancement_time_ms=enhancement_time_ms,
            embedding_time_ms=embedding_time_ms,
            vector_fallback=vector_fallback,
            search_time_ms=search_time_ms,
            rerank_time_ms=rerank_time_ms,
            fallback_time_ms=fallback_time_ms,
            fallback_used=fallback_used,
            fallback_stage=fallback_stage,
            total_time_ms=total_time_ms,
            query_type=query_type,
            effective_alpha=effective_alpha,
            alpha_was_routed=alpha_was_routed,
        )

        logger.info(
            f"Search completed: {len(results)} results in {total_time_ms:.0f}ms "
            f"(embedding: {embedding_time_ms:.0f}ms, search: {search_time_ms:.0f}ms)"
        )

        pagination = _build_search_pagination(offset, limit, len(results))

        try:
            from app.search_telemetry import record_search

            record_search(
                query=query,
                query_type=query_type,
                language=_detect_search_language(
                    keyword_query, request.languages, effective_filters["jurisdictions"]
                ),
                hits=len(chunks),
                chunks_preview=[
                    {"document_id": c.document_id, "score": getattr(c, "score", None)}
                    for c in chunks[:5]
                ],
                timing_breakdown=timing_breakdown.model_dump()
                if hasattr(timing_breakdown, "model_dump")
                else dict(timing_breakdown),
                effective_alpha=effective_alpha,
                alpha_was_routed=alpha_was_routed,
                vector_fallback=vector_fallback,
                fallback_used=fallback_used,
                thinking_mode=request.mode == "thinking",
            )
        except Exception as telem_err:
            logger.debug(f"Search telemetry skipped: {telem_err}")

        return SearchChunksResponse(
            chunks=chunks,
            documents=documents,
            total_chunks=len(chunks),
            unique_documents=len(documents),
            query_time_ms=round(search_time_ms, 2),
            timing_breakdown=timing_breakdown,
            pagination=pagination,
            enhanced_query=enhanced_query_text if request.mode == "thinking" else None,
            query_enhancement_used=request.mode == "thinking",
            semantic_query=semantic_query if request.mode == "thinking" else None,
            keyword_query=keyword_query if request.mode == "thinking" else None,
            inferred_filters=inferred_filters if request.mode == "thinking" else None,
            query_analysis_source=query_analysis_source,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.opt(exception=True).error("Search error: {}", e)
        from app.sentry import capture_exception

        capture_exception(e, query=query[:200], limit=limit)
        raise HTTPException(status_code=500, detail=f"Search failed: {e!s}")


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

        # Call faceting function
        response = supabase.rpc(
            "get_judgment_facets",
            {
                "pre_filter_jurisdictions": [jurisdiction] if jurisdiction else None,
                "pre_filter_date_from": date_from,
                "pre_filter_date_to": date_to,
            },
        ).execute()

        # Group facets by type
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
        logger.error(f"Facets retrieval error: {e!s}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get facets: {e!s}")


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

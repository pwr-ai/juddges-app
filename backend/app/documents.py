"""
Document search and retrieval API endpoints using Supabase pgvector.

This module provides:
- Document listing and sampling
- Semantic search using vector embeddings
- Hybrid search (vector + full-text + filters)
- Document retrieval by ID
- Similar document discovery
"""

import asyncio
import os
import random
import re
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query, Response
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.models import DocumentType, IssuingBody, LegalDocument
from loguru import logger

from app.config import settings
from app.models import (
    BatchDocumentsRequest,
    BatchDocumentsResponse,
    CitationEdge,
    CitationNetworkResponse,
    CitationNetworkStatistics,
    CitationNode,
    DocumentRequest,
    DocumentResponse,
    DocumentRetrievalRequest,
    DocumentRetrievalResponse,
    FacetsResponse,
    PaginationMetadata,
    SearchChunksRequest,
    SearchChunksResponse,
    SimilarDocumentResult,
    SimilarDocumentsRequest,
    SimilarDocumentsResponse,
    validate_id_format,
)
from app.utils import (
    validate_array_size,
    validate_string_length,
)
from app.utils.date_utils import parse_date

router = APIRouter(prefix="/documents", tags=["documents"])
JUDGMENTS_EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))

# Cache for document IDs with configurable TTL
_document_ids_cache: dict[str, Any] = {
    "ttl_seconds": settings.CACHE_TTL_SECONDS,
}
_cache_lock = asyncio.Lock()


async def generate_embedding(text: str) -> list[float]:
    """Generate embedding for text using the active embedding provider.

    Uses the configured embedding provider (OpenAI, Cohere, or local model)
    based on the EMBEDDING_MODEL_ID environment variable.

    Args:
        text: Text to embed

    Returns:
        Embedding vector (dimensions depend on the active model)
    """
    from app.embedding_providers import get_embedding_provider

    provider = get_embedding_provider()
    return await provider.embed_text(text)


# Common Polish characters and words for language detection
_POLISH_CHARS = re.compile(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]")
_POLISH_STOPWORDS = frozenset(
    {
        "i",
        "w",
        "z",
        "na",
        "do",
        "nie",
        "się",
        "jest",
        "za",
        "od",
        "że",
        "jak",
        "ale",
        "co",
        "to",
        "ten",
        "ta",
        "po",
        "dla",
        "jej",
        "jego",
        "ich",
        "tym",
        "przez",
        "tak",
        "już",
        "są",
        "tej",
        "te",
        "tego",
        "być",
        "sąd",
        "wyrok",
        "orzeczenie",
        "sprawy",
        "karny",
        "cywilny",
        "apelacyjny",
        "odpowiedzialność",
    }
)


def _detect_search_language(
    query: str,
    languages: list[str] | None,
    jurisdictions: list[str] | None,
) -> str:
    """Detect appropriate PostgreSQL text search configuration.

    Priority: explicit language filter > jurisdiction filter > query content heuristic.
    Returns 'english' or 'simple' (for Polish and unknown languages).
    """
    # 1. Explicit language filter
    if languages:
        if "en" in languages or "uk" in languages:
            return "english"
        if "pl" in languages:
            return "simple"

    # 2. Jurisdiction filter implies language
    if jurisdictions:
        if jurisdictions == ["UK"]:
            return "english"
        if jurisdictions == ["PL"]:
            return "simple"

    # 3. Content-based heuristic: detect Polish from characters or stopwords
    lower = query.lower()
    if _POLISH_CHARS.search(query):
        return "simple"

    query_tokens = set(re.findall(r"\w+", lower))
    polish_overlap = query_tokens & _POLISH_STOPWORDS
    if len(polish_overlap) >= 2:
        return "simple"

    # Default to English for FTS stemming benefits
    return "english"


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


async def _get_cached_document_ids(only_with_coordinates: bool = False) -> list[str]:
    """Get all document IDs with caching.

    Args:
        only_with_coordinates: If True, only return documents with x,y coordinates

    Returns:
        List of document IDs
    """
    cache_key = "with_coords" if only_with_coordinates else "all"

    async with _cache_lock:
        now = datetime.now(UTC)
        if cache_key not in _document_ids_cache:
            _document_ids_cache[cache_key] = {"data": None, "timestamp": None}

        cache_entry = _document_ids_cache[cache_key]
        if cache_entry["data"] is not None and cache_entry["timestamp"] is not None:
            elapsed = (now - cache_entry["timestamp"]).total_seconds()
            if elapsed < _document_ids_cache["ttl_seconds"]:
                return cache_entry["data"]

    # Fetch from database
    db = get_vector_db()
    try:
        if only_with_coordinates:
            # Query documents with coordinates
            response = (
                db.client.table("legal_documents")
                .select("document_id, x, y")
                .not_.is_("x", "null")
                .not_.is_("y", "null")
                .limit(settings.MAX_DOCUMENT_IDS_FETCH_LIMIT)
                .execute()
            )
        else:
            response = (
                db.client.table("legal_documents")
                .select("document_id")
                .limit(settings.MAX_DOCUMENT_IDS_FETCH_LIMIT)
                .execute()
            )

        document_ids = [doc["document_id"] for doc in (response.data or [])]
        logger.info(
            f"Found {len(document_ids)} documents (only_with_coords={only_with_coordinates})"
        )

    except Exception as e:
        logger.error(f"Error fetching document IDs: {e}")
        document_ids = []

    # Update cache
    async with _cache_lock:
        _document_ids_cache[cache_key]["data"] = document_ids
        _document_ids_cache[cache_key]["timestamp"] = datetime.now(UTC)

    return document_ids


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


def _normalize_ref(ref_text: str) -> str:
    match = re.search(r"r\.\s*-\s*(.+?)(?:\s*\(Dz\.|\s*-\s*art\.)", ref_text)
    if match:
        return match.group(1).strip()
    return ref_text[:80].strip()


def _build_ref_index(
    docs: list[dict],
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
    ref_to_docs: dict[str, list[str]] = {}
    doc_refs: dict[str, list[str]] = {}
    doc_raw_refs: dict[str, list[str]] = {}

    for doc in docs:
        doc_id = doc["document_id"]
        refs = doc.get("references", []) or []
        normalized = [_normalize_ref(r) for r in refs]
        doc_refs[doc_id] = normalized
        doc_raw_refs[doc_id] = refs

        for norm_ref in set(normalized):
            if norm_ref not in ref_to_docs:
                ref_to_docs[norm_ref] = []
            ref_to_docs[norm_ref].append(doc_id)

    return ref_to_docs, doc_refs, doc_raw_refs


def _calc_authority_scores(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    ref_to_docs: dict[str, list[str]],
) -> dict[str, float]:
    max_sharing = max((len(ids) for ids in ref_to_docs.values()), default=1)
    authority_scores: dict[str, float] = {}

    for doc in docs:
        doc_id = doc["document_id"]
        refs = doc_refs.get(doc_id, [])
        if not refs:
            authority_scores[doc_id] = 0.0
            continue
        sharing_counts = [len(ref_to_docs.get(r, [])) for r in set(refs)]
        avg_sharing = sum(sharing_counts) / len(sharing_counts) if sharing_counts else 0
        authority_scores[doc_id] = min(avg_sharing / max(max_sharing, 1), 1.0)

    return authority_scores


def _build_citation_nodes(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    authority_scores: dict[str, float],
) -> list[CitationNode]:
    nodes = []
    for doc in docs:
        doc_id = doc["document_id"]
        year = None
        if doc.get("date_issued"):
            try:
                if isinstance(doc["date_issued"], str):
                    dt = datetime.fromisoformat(
                        doc["date_issued"].replace("Z", "+00:00")
                    )
                    year = dt.year
            except (ValueError, TypeError):
                pass

        refs = doc.get("references", []) or []
        nodes.append(
            CitationNode(
                id=doc_id,
                title=doc.get("title") or f"Document {doc_id}",
                document_type=doc.get("document_type", "unknown"),
                year=year,
                x=float(doc.get("x") or 0.0),
                y=float(doc.get("y") or 0.0),
                citation_count=len(refs),
                authority_score=round(authority_scores.get(doc_id, 0.0), 3),
                references=refs,
                metadata={
                    "court_name": doc.get("court_name"),
                    "document_number": doc.get("document_number"),
                    "language": doc.get("language"),
                    "date_issued": doc.get("date_issued"),
                },
            )
        )
    return nodes


def _build_citation_edges(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    min_shared_refs: int,
) -> list[CitationEdge]:
    edges = []
    doc_ids = [doc["document_id"] for doc in docs]
    seen_pairs: set[tuple[str, str]] = set()

    for i, doc_id_a in enumerate(doc_ids):
        refs_a = set(doc_refs.get(doc_id_a, []))
        for j in range(i + 1, len(doc_ids)):
            doc_id_b = doc_ids[j]
            refs_b = set(doc_refs.get(doc_id_b, []))
            shared = refs_a & refs_b
            if len(shared) < min_shared_refs:
                continue
            pair = (min(doc_id_a, doc_id_b), max(doc_id_a, doc_id_b))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            union = refs_a | refs_b
            weight = len(shared) / len(union) if union else 0.0
            edges.append(
                CitationEdge(
                    source=doc_id_a,
                    target=doc_id_b,
                    shared_refs=list(shared),
                    weight=round(weight, 3),
                )
            )

    return edges


def _build_citation_statistics(
    docs: list[dict],
    ref_to_docs: dict[str, list[str]],
    authority_scores: dict[str, float],
    nodes: list[CitationNode],
    edges: list[CitationEdge],
) -> CitationNetworkStatistics:
    all_citation_counts = [len(doc.get("references", []) or []) for doc in docs]
    ref_counts = sorted(
        [(ref, len(ids)) for ref, ids in ref_to_docs.items()],
        key=lambda x: x[1],
        reverse=True,
    )[:10]
    most_cited = [{"reference": ref, "count": count} for ref, count in ref_counts]
    all_authority = list(authority_scores.values())

    return CitationNetworkStatistics(
        total_nodes=len(nodes),
        total_edges=len(edges),
        avg_citations=round(sum(all_citation_counts) / len(all_citation_counts), 2)
        if all_citation_counts
        else 0.0,
        max_citations=max(all_citation_counts) if all_citation_counts else 0,
        most_cited_refs=most_cited,
        avg_authority_score=round(sum(all_authority) / len(all_authority), 3)
        if all_authority
        else 0.0,
    )


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
async def get_similar_to_document(
    document_id: str = Path(
        ..., description="Document ID to find similar documents for"
    ),
    top_k: int = Query(
        10, ge=1, le=100, description="Maximum number of similar documents"
    ),
) -> SimilarDocumentsResponse:
    """Find documents similar to a specific document using vector similarity."""
    try:
        validate_id_format(document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        db = get_vector_db()

        # Fetch the source document to get its embedding
        doc_data = await db.get_document_by_id(document_id)
        if not doc_data:
            raise HTTPException(
                status_code=404, detail=f"Document {document_id} not found"
            )

        # Get the embedding - first try from document, then generate
        embedding = doc_data.get("embedding")
        if not embedding:
            # Generate embedding from summary or title
            text = (
                doc_data.get("summary")
                or doc_data.get("title")
                or doc_data.get("full_text", "")[:2000]
            )
            if not text:
                raise HTTPException(
                    status_code=400,
                    detail="Document has no content to generate embedding",
                )
            embedding = await generate_embedding(text)

        # Search for similar documents
        similar_results = await db.search_by_vector(
            query_embedding=embedding,
            match_count=top_k + 1,  # +1 to exclude self
            match_threshold=0.3,
        )

        # Filter out self and convert results
        results = []
        for result in similar_results:
            if result.get("document_id") == document_id:
                continue
            if len(results) >= top_k:
                break

            results.append(
                SimilarDocumentResult(
                    document_id=result.get("document_id", ""),
                    db_id=result.get("supabase_document_id", ""),
                    similarity_score=result.get("similarity", 0.0),
                    title=result.get("title"),
                    document_type=result.get("document_type"),
                    date_issued=result.get("date_issued"),
                    publication_date=result.get("publication_date"),
                    document_number=result.get("document_number"),
                    country=result.get("country"),
                    language=result.get("language"),
                )
            )

        return SimilarDocumentsResponse(
            query_document_id=document_id,
            similar_documents=results,
            total_found=len(results),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding similar documents for {document_id}: {e!s}")
        raise HTTPException(status_code=500, detail="Error finding similar documents.")


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
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        validate_string_length(query, 2000, "query")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(
        f"Search request: query='{query[:100]}...', limit={request.limit_docs}, "
        f"languages={request.languages}, document_types={request.document_types}, "
        f"jurisdictions={request.jurisdictions}, case_types={request.case_types}"
    )

    try:
        # Analyze/rewrite query if in "thinking" mode
        semantic_query = query
        keyword_query = query
        enhanced_query_text = None
        inferred_filters: dict[str, Any] | None = None
        enhancement_time_ms = 0
        query_analysis_source = None
        if request.mode == "thinking":
            from app.query_analysis import analyze_query_with_fallback

            enhancement_start = time.perf_counter()
            logger.info(f"Analyzing query in thinking mode: {query}")
            (
                analysis,
                query_analysis_source,
                query_analysis_error,
            ) = await analyze_query_with_fallback(query)
            enhancement_time_ms = (time.perf_counter() - enhancement_start) * 1000

            if query_analysis_source == "heuristic":
                logger.warning(
                    "LLM query analysis failed; using heuristic fallback",
                    error=query_analysis_error,
                )

            semantic_query = (analysis.semantic_query or query).strip() or query
            keyword_query = (analysis.keyword_query or query).strip() or query
            enhanced_query_text = (
                semantic_query
                if semantic_query != query
                else (keyword_query if keyword_query != query else None)
            )

            # Apply inferred filters only when request didn't provide explicit ones.
            effective_filters = {
                "jurisdictions": request.jurisdictions,
                "court_names": request.court_names,
                "court_levels": request.court_levels,
                "case_types": request.case_types,
                "decision_types": request.decision_types,
                "outcomes": request.outcomes,
                "keywords": request.keywords,
                "legal_topics": request.legal_topics,
                "cited_legislation": request.cited_legislation,
                "date_from": request.date_from,
                "date_to": request.date_to,
            }

            inferred_filters = {}
            for key in (
                "jurisdictions",
                "court_names",
                "court_levels",
                "case_types",
                "decision_types",
                "outcomes",
                "keywords",
                "legal_topics",
                "cited_legislation",
            ):
                if effective_filters[key] is None:
                    inferred_value = getattr(analysis, key, None)
                    if inferred_value:
                        effective_filters[key] = inferred_value
                        inferred_filters[key] = inferred_value

            for key in ("date_from", "date_to"):
                if not effective_filters[key]:
                    inferred_value = getattr(analysis, key, None)
                    if inferred_value:
                        effective_filters[key] = inferred_value
                        inferred_filters[key] = inferred_value

            request.jurisdictions = effective_filters["jurisdictions"]
            request.court_names = effective_filters["court_names"]
            request.court_levels = effective_filters["court_levels"]
            request.case_types = effective_filters["case_types"]
            request.decision_types = effective_filters["decision_types"]
            request.outcomes = effective_filters["outcomes"]
            request.keywords = effective_filters["keywords"]
            request.legal_topics = effective_filters["legal_topics"]
            request.cited_legislation = effective_filters["cited_legislation"]
            request.date_from = effective_filters["date_from"]
            request.date_to = effective_filters["date_to"]

            if not inferred_filters:
                inferred_filters = None

            logger.info(
                "Query analysis completed",
                semantic_query=semantic_query,
                keyword_query=keyword_query,
                source=query_analysis_source,
                inferred_filters=list((inferred_filters or {}).keys()),
            )

        # Generate embedding for query (if vector search is enabled)
        query_embedding = None
        embedding_time_ms = 0
        if request.alpha > 0:  # Vector search component enabled
            embedding_start = time.perf_counter()
            query_embedding = await generate_embedding(semantic_query)
            if len(query_embedding) != JUDGMENTS_EMBEDDING_DIMENSION:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Embedding dimension mismatch: expected "
                        f"{JUDGMENTS_EMBEDDING_DIMENSION}, got {len(query_embedding)}. "
                        "Check EMBEDDING_DIMENSION and EMBEDDING_MODEL_ID configuration."
                    ),
                )
            embedding_time_ms = (time.perf_counter() - embedding_start) * 1000

        # Detect search language from explicit filter, inferred jurisdiction, or query content
        search_language = _detect_search_language(
            keyword_query, request.languages, request.jurisdictions
        )

        # Perform hybrid search using the new database function
        from app.core.supabase import get_supabase_client

        supabase = get_supabase_client()

        if not supabase:
            raise HTTPException(
                status_code=500, detail="Database client not initialized"
            )

        search_start = time.perf_counter()

        # Call search_judgments_hybrid RPC with RRF fusion
        response = supabase.rpc(
            "search_judgments_hybrid",
            {
                "query_embedding": query_embedding,
                "search_text": keyword_query
                if request.alpha < 1.0
                else None,  # Skip text search if pure vector
                "search_language": search_language,
                "filter_jurisdictions": request.jurisdictions,
                "filter_court_names": request.court_names,
                "filter_court_levels": request.court_levels,
                "filter_case_types": request.case_types,
                "filter_decision_types": request.decision_types,
                "filter_outcomes": request.outcomes,
                "filter_keywords": request.keywords,
                "filter_legal_topics": request.legal_topics,
                "filter_cited_legislation": request.cited_legislation,
                "filter_date_from": request.date_from,
                "filter_date_to": request.date_to,
                "similarity_threshold": 0.5,
                "hybrid_alpha": request.alpha,
                "result_limit": request.limit_docs or 20,
                "result_offset": request.offset or 0,
                "rrf_k": 60,
            },
        ).execute()

        results = response.data or []
        search_time_ms = (time.perf_counter() - search_start) * 1000

        # Convert to chunks format for compatibility
        chunks = []
        documents = []

        for result in results:
            # Create DocumentChunk-compatible representation with enhanced metadata
            chunk_data = {
                "document_id": str(result.get("id", "")),  # Use judgment ID
                "chunk_id": 0,  # First chunk for each document
                "chunk_text": result.get("chunk_text", "")
                or result.get("summary", "")
                or result.get("title", ""),
                "chunk_type": result.get("chunk_type", "summary"),
                "chunk_start_pos": result.get("chunk_start_pos", 0),
                "chunk_end_pos": result.get("chunk_end_pos", 0),
                "similarity": result.get("combined_score", 0.0),
                "metadata": result.get("chunk_metadata", {}),
                # Include scoring details for transparency
                "vector_score": result.get("vector_score"),
                "text_score": result.get("text_score"),
                "combined_score": result.get("combined_score"),
            }
            chunks.append(chunk_data)

            # Convert to full document
            doc = _convert_judgment_to_legal_document(result)
            documents.append(doc)

        total_time_ms = (time.perf_counter() - start_time) * 1000

        timing_breakdown = {
            "enhancement_ms": round(enhancement_time_ms, 2)
            if request.mode == "thinking"
            else 0,
            "embedding_ms": round(embedding_time_ms, 2),
            "search_ms": round(search_time_ms, 2),
            "total_ms": round(total_time_ms, 2),
        }

        logger.info(
            f"Search completed: {len(results)} results in {total_time_ms:.0f}ms "
            f"(embedding: {embedding_time_ms:.0f}ms, search: {search_time_ms:.0f}ms)"
        )

        pagination = PaginationMetadata(
            offset=request.offset or 0,
            limit=request.limit_docs or 20,
            loaded_count=len(results),
            estimated_total=None,
            has_more=len(results)
            >= (request.limit_docs or 20),  # More results if we got a full page
            next_offset=(request.offset or 0) + len(results)
            if len(results) >= (request.limit_docs or 20)
            else None,
        )

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
        logger.error(f"Search error: {e!s}", exc_info=True)
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
        all_responses = []

        for doc_id in request.document_ids:
            try:
                response = await get_similar_to_document(
                    document_id=doc_id, top_k=request.top_k
                )
                all_responses.append(response)
            except HTTPException:
                # If one document fails, add empty response
                all_responses.append(
                    SimilarDocumentsResponse(
                        query_document_id=doc_id,
                        similar_documents=[],
                        total_found=0,
                    )
                )

        return all_responses

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

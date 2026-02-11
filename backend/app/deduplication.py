"""
Document deduplication API endpoints.

Provides:
- Content hashing for exact duplicate detection (SHA-256)
- Semantic similarity-based near-duplicate detection using existing embeddings
- Duplicate group management and scanning
"""

import hashlib
import time
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from juddges_search.db.supabase_db import get_vector_db

router = APIRouter(prefix="/deduplication", tags=["deduplication"])


# ===== Models =====


class DuplicatePair(BaseModel):
    """A pair of documents identified as duplicates."""
    document_id_a: str
    document_id_b: str
    title_a: Optional[str] = None
    title_b: Optional[str] = None
    document_type_a: Optional[str] = None
    document_type_b: Optional[str] = None
    date_issued_a: Optional[str] = None
    date_issued_b: Optional[str] = None
    similarity_score: float = Field(ge=0.0, le=1.0)
    duplicate_type: str = Field(description="'exact' or 'near_duplicate'")
    content_hash_a: Optional[str] = None
    content_hash_b: Optional[str] = None


class DuplicateGroup(BaseModel):
    """A group of documents that are duplicates of each other."""
    group_id: str
    canonical_document_id: str
    duplicate_type: str
    members: List[Dict[str, Any]]
    member_count: int


class ScanRequest(BaseModel):
    """Request to scan documents for duplicates."""
    similarity_threshold: float = Field(
        default=0.95,
        ge=0.5,
        le=1.0,
        description="Minimum cosine similarity to flag as near-duplicate (0.5-1.0)",
    )
    max_documents: int = Field(
        default=100,
        ge=1,
        le=500,
        description="Maximum number of documents to scan",
    )
    include_exact: bool = Field(
        default=True,
        description="Check for exact duplicates via content hash",
    )
    include_near_duplicates: bool = Field(
        default=True,
        description="Check for near-duplicates via embedding similarity",
    )


class ScanResponse(BaseModel):
    """Response from a deduplication scan."""
    exact_duplicates: List[DuplicatePair]
    near_duplicates: List[DuplicatePair]
    total_documents_scanned: int
    total_exact_duplicates: int
    total_near_duplicates: int
    scan_time_ms: float


class CheckDocumentRequest(BaseModel):
    """Request to check a single document for duplicates."""
    document_id: str = Field(description="Document ID to check")
    similarity_threshold: float = Field(
        default=0.95,
        ge=0.5,
        le=1.0,
        description="Minimum cosine similarity threshold",
    )


class CheckDocumentResponse(BaseModel):
    """Response from checking a document for duplicates."""
    document_id: str
    has_exact_duplicate: bool
    has_near_duplicates: bool
    exact_duplicates: List[Dict[str, Any]]
    near_duplicates: List[DuplicatePair]
    content_hash: Optional[str] = None


class DeduplicationStatsResponse(BaseModel):
    """Statistics about duplicates in the database."""
    total_documents: int
    documents_with_hash: int
    documents_without_hash: int
    flagged_duplicates: int
    duplicate_groups: int
    scan_coverage_pct: float


# ===== Utility Functions =====


def compute_content_hash(text: str) -> str:
    """Compute SHA-256 hash of document text content."""
    normalized = text.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _cosine_similarity_batch(
    query_vec: np.ndarray, matrix: np.ndarray
) -> np.ndarray:
    """Compute cosine similarity between a query vector and a matrix of vectors."""
    query_norm = np.linalg.norm(query_vec)
    if query_norm == 0:
        return np.zeros(matrix.shape[0])

    matrix_norms = np.linalg.norm(matrix, axis=1)
    # Avoid division by zero
    matrix_norms[matrix_norms == 0] = 1.0

    similarities = np.dot(matrix, query_vec) / (matrix_norms * query_norm)
    return np.clip(similarities, 0.0, 1.0)


# ===== Endpoints =====


@router.get(
    "/stats",
    response_model=DeduplicationStatsResponse,
    summary="Get deduplication statistics",
)
async def get_deduplication_stats() -> DeduplicationStatsResponse:
    """Get statistics about document deduplication coverage."""
    try:
        db = get_vector_db()

        # Count total documents
        total_resp = (
            db.client.table("legal_documents")
            .select("supabase_document_id", count="exact")
            .execute()
        )
        total_documents = total_resp.count or 0

        # Count documents with content hash
        hash_resp = (
            db.client.table("legal_documents")
            .select("supabase_document_id", count="exact")
            .not_.is_("content_hash", "null")
            .execute()
        )
        documents_with_hash = hash_resp.count or 0

        # Count flagged duplicates
        dup_resp = (
            db.client.table("legal_documents")
            .select("supabase_document_id", count="exact")
            .eq("is_duplicate", True)
            .execute()
        )
        flagged_duplicates = dup_resp.count or 0

        # Count duplicate groups
        groups_resp = (
            db.client.table("document_duplicate_groups")
            .select("id", count="exact")
            .execute()
        )
        duplicate_groups = groups_resp.count or 0

        coverage = (documents_with_hash / total_documents * 100) if total_documents > 0 else 0.0

        return DeduplicationStatsResponse(
            total_documents=total_documents,
            documents_with_hash=documents_with_hash,
            documents_without_hash=total_documents - documents_with_hash,
            flagged_duplicates=flagged_duplicates,
            duplicate_groups=duplicate_groups,
            scan_coverage_pct=round(coverage, 1),
        )
    except Exception as e:
        logger.error(f"Error getting deduplication stats: {e}")
        # Return zeros if tables don't exist yet (migration not applied)
        return DeduplicationStatsResponse(
            total_documents=0,
            documents_with_hash=0,
            documents_without_hash=0,
            flagged_duplicates=0,
            duplicate_groups=0,
            scan_coverage_pct=0.0,
        )


@router.post(
    "/scan",
    response_model=ScanResponse,
    summary="Scan documents for duplicates",
)
async def scan_for_duplicates(request: ScanRequest) -> ScanResponse:
    """
    Scan documents for exact and near-duplicate matches.

    - Exact duplicates: Detected by SHA-256 hash of full_text content
    - Near-duplicates: Detected by cosine similarity of document embeddings
    """
    start_time = time.perf_counter()
    db = get_vector_db()

    # Fetch documents with embeddings
    select_fields = "document_id, title, document_type, date_issued, full_text, embedding, content_hash"
    try:
        response = (
            db.client.table("legal_documents")
            .select(select_fields)
            .limit(request.max_documents)
            .execute()
        )
    except Exception:
        # Fallback if content_hash column doesn't exist yet
        select_fields = "document_id, title, document_type, date_issued, full_text, embedding"
        response = (
            db.client.table("legal_documents")
            .select(select_fields)
            .limit(request.max_documents)
            .execute()
        )

    docs = response.data or []
    if not docs:
        return ScanResponse(
            exact_duplicates=[],
            near_duplicates=[],
            total_documents_scanned=0,
            total_exact_duplicates=0,
            total_near_duplicates=0,
            scan_time_ms=0.0,
        )

    exact_duplicates: List[DuplicatePair] = []
    near_duplicates: List[DuplicatePair] = []

    # --- Exact duplicate detection via content hashing ---
    if request.include_exact:
        hash_to_docs: Dict[str, List[Dict]] = {}
        for doc in docs:
            full_text = doc.get("full_text", "")
            if not full_text:
                continue
            content_hash = doc.get("content_hash") or compute_content_hash(full_text)
            if content_hash not in hash_to_docs:
                hash_to_docs[content_hash] = []
            hash_to_docs[content_hash].append({**doc, "_hash": content_hash})

        for content_hash, group in hash_to_docs.items():
            if len(group) < 2:
                continue
            # Report all pairwise duplicates within the group
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    exact_duplicates.append(
                        DuplicatePair(
                            document_id_a=group[i]["document_id"],
                            document_id_b=group[j]["document_id"],
                            title_a=group[i].get("title"),
                            title_b=group[j].get("title"),
                            document_type_a=group[i].get("document_type"),
                            document_type_b=group[j].get("document_type"),
                            date_issued_a=str(group[i].get("date_issued", "")) if group[i].get("date_issued") else None,
                            date_issued_b=str(group[j].get("date_issued", "")) if group[j].get("date_issued") else None,
                            similarity_score=1.0,
                            duplicate_type="exact",
                            content_hash_a=content_hash,
                            content_hash_b=content_hash,
                        )
                    )

    # --- Near-duplicate detection via embedding similarity ---
    if request.include_near_duplicates:
        # Collect documents with embeddings
        docs_with_embeddings = []
        for doc in docs:
            embedding = doc.get("embedding")
            if embedding and isinstance(embedding, list) and len(embedding) > 0:
                docs_with_embeddings.append(doc)

        if len(docs_with_embeddings) >= 2:
            # Build embedding matrix
            embeddings = np.array(
                [doc["embedding"] for doc in docs_with_embeddings],
                dtype=np.float32,
            )

            # Normalize for cosine similarity
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            normalized = embeddings / norms

            # Compute pairwise similarity matrix
            sim_matrix = np.dot(normalized, normalized.T)

            # Extract pairs above threshold (excluding self and exact duplicates)
            exact_pairs = {
                (dp.document_id_a, dp.document_id_b) for dp in exact_duplicates
            }
            exact_pairs.update(
                {(dp.document_id_b, dp.document_id_a) for dp in exact_duplicates}
            )

            n = len(docs_with_embeddings)
            for i in range(n):
                for j in range(i + 1, n):
                    sim = float(sim_matrix[i, j])
                    if sim < request.similarity_threshold:
                        continue

                    doc_a = docs_with_embeddings[i]
                    doc_b = docs_with_embeddings[j]

                    # Skip if already reported as exact duplicate
                    pair = (doc_a["document_id"], doc_b["document_id"])
                    if pair in exact_pairs:
                        continue

                    near_duplicates.append(
                        DuplicatePair(
                            document_id_a=doc_a["document_id"],
                            document_id_b=doc_b["document_id"],
                            title_a=doc_a.get("title"),
                            title_b=doc_b.get("title"),
                            document_type_a=doc_a.get("document_type"),
                            document_type_b=doc_b.get("document_type"),
                            date_issued_a=str(doc_a.get("date_issued", "")) if doc_a.get("date_issued") else None,
                            date_issued_b=str(doc_b.get("date_issued", "")) if doc_b.get("date_issued") else None,
                            similarity_score=round(sim, 4),
                            duplicate_type="near_duplicate",
                        )
                    )

    # Sort near-duplicates by score descending
    near_duplicates.sort(key=lambda x: x.similarity_score, reverse=True)

    scan_time_ms = (time.perf_counter() - start_time) * 1000

    return ScanResponse(
        exact_duplicates=exact_duplicates,
        near_duplicates=near_duplicates,
        total_documents_scanned=len(docs),
        total_exact_duplicates=len(exact_duplicates),
        total_near_duplicates=len(near_duplicates),
        scan_time_ms=round(scan_time_ms, 2),
    )


@router.post(
    "/check",
    response_model=CheckDocumentResponse,
    summary="Check a single document for duplicates",
)
async def check_document_duplicates(
    request: CheckDocumentRequest,
) -> CheckDocumentResponse:
    """Check if a specific document has exact or near-duplicates in the database."""
    db = get_vector_db()

    # Fetch the target document
    doc_data = await db.get_document_by_id(request.document_id)
    if not doc_data:
        raise HTTPException(
            status_code=404,
            detail=f"Document {request.document_id} not found",
        )

    # Compute content hash
    full_text = doc_data.get("full_text", "")
    content_hash = compute_content_hash(full_text) if full_text else None

    # Check for exact duplicates by hash
    exact_duplicates: List[Dict[str, Any]] = []
    if content_hash:
        try:
            hash_resp = (
                db.client.table("legal_documents")
                .select("document_id, title, document_type, date_issued, content_hash")
                .eq("content_hash", content_hash)
                .neq("document_id", request.document_id)
                .limit(20)
                .execute()
            )
            exact_duplicates = hash_resp.data or []
        except Exception:
            # content_hash column may not exist yet - fall back to text comparison
            pass

        # If no results from hash column, check by computing hashes
        if not exact_duplicates and full_text:
            try:
                all_docs_resp = (
                    db.client.table("legal_documents")
                    .select("document_id, title, document_type, date_issued, full_text")
                    .neq("document_id", request.document_id)
                    .limit(200)
                    .execute()
                )
                for other_doc in (all_docs_resp.data or []):
                    other_text = other_doc.get("full_text", "")
                    if other_text and compute_content_hash(other_text) == content_hash:
                        exact_duplicates.append({
                            "document_id": other_doc["document_id"],
                            "title": other_doc.get("title"),
                            "document_type": other_doc.get("document_type"),
                            "date_issued": str(other_doc.get("date_issued", "")) if other_doc.get("date_issued") else None,
                            "similarity_score": 1.0,
                        })
            except Exception as e:
                logger.warning(f"Error checking text-based duplicates: {e}")

    # Check for near-duplicates by embedding similarity
    near_duplicates: List[DuplicatePair] = []
    embedding = doc_data.get("embedding")
    if embedding and isinstance(embedding, list) and len(embedding) > 0:
        try:
            similar_results = await db.search_by_vector(
                query_embedding=embedding,
                match_count=20,
                match_threshold=request.similarity_threshold,
            )

            exact_ids = {d["document_id"] for d in exact_duplicates}
            for result in similar_results:
                result_id = result.get("document_id", "")
                if result_id == request.document_id or result_id in exact_ids:
                    continue

                sim_score = result.get("similarity", 0.0)
                if sim_score >= request.similarity_threshold:
                    near_duplicates.append(
                        DuplicatePair(
                            document_id_a=request.document_id,
                            document_id_b=result_id,
                            title_a=doc_data.get("title"),
                            title_b=result.get("title"),
                            document_type_a=doc_data.get("document_type"),
                            document_type_b=result.get("document_type"),
                            date_issued_a=str(doc_data.get("date_issued", "")) if doc_data.get("date_issued") else None,
                            date_issued_b=str(result.get("date_issued", "")) if result.get("date_issued") else None,
                            similarity_score=round(sim_score, 4),
                            duplicate_type="near_duplicate",
                        )
                    )
        except Exception as e:
            logger.warning(f"Error checking embedding similarity: {e}")

    near_duplicates.sort(key=lambda x: x.similarity_score, reverse=True)

    return CheckDocumentResponse(
        document_id=request.document_id,
        has_exact_duplicate=len(exact_duplicates) > 0,
        has_near_duplicates=len(near_duplicates) > 0,
        exact_duplicates=exact_duplicates,
        near_duplicates=near_duplicates,
        content_hash=content_hash,
    )


@router.post(
    "/compute-hashes",
    summary="Compute content hashes for all documents",
)
async def compute_hashes(
    limit: int = Query(100, ge=1, le=500, description="Maximum documents to process"),
) -> Dict[str, Any]:
    """Compute and store SHA-256 content hashes for documents that don't have one yet."""
    db = get_vector_db()

    try:
        # Fetch documents without hashes
        response = (
            db.client.table("legal_documents")
            .select("supabase_document_id, document_id, full_text")
            .is_("content_hash", "null")
            .limit(limit)
            .execute()
        )
    except Exception:
        # content_hash column may not exist - fetch all and compute locally
        response = (
            db.client.table("legal_documents")
            .select("supabase_document_id, document_id, full_text")
            .limit(limit)
            .execute()
        )

    docs = response.data or []
    updated = 0
    errors = 0

    for doc in docs:
        full_text = doc.get("full_text", "")
        if not full_text:
            continue

        content_hash = compute_content_hash(full_text)

        try:
            db.client.table("legal_documents").update(
                {"content_hash": content_hash}
            ).eq(
                "supabase_document_id", doc["supabase_document_id"]
            ).execute()
            updated += 1
        except Exception as e:
            logger.warning(f"Error updating hash for document {doc['document_id']}: {e}")
            errors += 1

    return {
        "total_processed": len(docs),
        "hashes_computed": updated,
        "errors": errors,
        "message": f"Computed hashes for {updated} documents",
    }

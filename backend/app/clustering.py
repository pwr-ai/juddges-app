"""
Semantic document clustering API endpoints.

Provides:
- K-Means clustering of documents using existing embeddings
- Dimensionality reduction (PCA) for 2D visualization coordinates
- Topic keyword extraction per cluster using TF-IDF
- Cluster statistics and document membership
"""

import contextlib
import time
from collections import Counter
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger
from pydantic import BaseModel, Field

from app.rate_limiter import limiter

router = APIRouter(prefix="/clustering", tags=["clustering"])

# Per-endpoint rate limit for computationally expensive clustering
CLUSTERING_RATE_LIMIT = "10/hour"


# ===== Models =====


class ClusteringRequest(BaseModel):
    """Request to perform semantic clustering on documents."""

    sample_size: int = Field(
        default=100,
        ge=10,
        le=500,
        description="Number of documents to cluster",
    )
    num_clusters: int = Field(
        default=5,
        ge=2,
        le=20,
        description="Number of clusters to create",
    )
    document_types: list[str] | None = Field(
        default=None, description="Optional filter by document types"
    )


class ClusterDocument(BaseModel):
    """A document within a cluster."""

    document_id: str
    title: str | None = None
    document_type: str | None = None
    date_issued: str | None = None
    similarity_to_centroid: float = Field(
        ge=0.0, le=1.0, description="Cosine similarity to cluster centroid"
    )


class SemanticCluster(BaseModel):
    """A single semantic cluster."""

    cluster_id: int
    size: int = Field(description="Number of documents in this cluster")
    keywords: list[str] = Field(description="Top keywords representing this cluster")
    coherence_score: float = Field(
        ge=0.0, le=1.0, description="Average intra-cluster similarity"
    )
    documents: list[ClusterDocument] = Field(description="Documents in this cluster")


class ClusterNode(BaseModel):
    """Node in the cluster visualization."""

    id: str = Field(description="Document ID")
    title: str = Field(description="Document title")
    document_type: str = Field(description="Type of document")
    year: int | None = Field(None, description="Year of document issuance")
    x: float = Field(description="X coordinate for visualization")
    y: float = Field(description="Y coordinate for visualization")
    cluster_id: int = Field(description="Cluster assignment")


class ClusterEdge(BaseModel):
    """Edge between documents in the same cluster."""

    source: str
    target: str
    similarity: float = Field(ge=0.0, le=1.0)


class ClusteringStatistics(BaseModel):
    """Statistics about the clustering result."""

    total_documents: int
    num_clusters: int
    avg_cluster_size: float
    min_cluster_size: int
    max_cluster_size: int
    avg_coherence: float
    clustering_time_ms: float


class ClusteringResponse(BaseModel):
    """Response from semantic clustering."""

    clusters: list[SemanticCluster]
    nodes: list[ClusterNode]
    edges: list[ClusterEdge]
    statistics: ClusteringStatistics


# ===== Utility Functions =====


def _extract_keywords_tfidf(
    documents: list[dict[str, Any]],
    labels: np.ndarray,
    num_clusters: int,
    top_n: int = 5,
) -> dict[int, list[str]]:
    """
    Extract top keywords per cluster using a simple TF-IDF approach.

    Uses title + summary text from documents, computing term frequency
    within each cluster and inverse document frequency across clusters.
    """
    cluster_texts: dict[int, list[str]] = {i: [] for i in range(num_clusters)}

    for doc, label in zip(documents, labels, strict=False):
        text_parts = []
        if doc.get("title"):
            text_parts.append(doc["title"])
        if doc.get("summary"):
            text_parts.append(doc["summary"])
        if doc.get("keywords") and isinstance(doc["keywords"], list):
            text_parts.extend(doc["keywords"])
        text = " ".join(text_parts).lower()
        cluster_texts[label].append(text)

    # Stopwords (Polish + English common ones)
    stopwords = {
        "w",
        "z",
        "na",
        "do",
        "i",
        "o",
        "nie",
        "się",
        "jest",
        "od",
        "za",
        "że",
        "to",
        "co",
        "po",
        "jak",
        "ale",
        "tym",
        "te",
        "ten",
        "ta",
        "tego",
        "tej",
        "przez",
        "dla",
        "ze",
        "pod",
        "nad",
        "przy",
        "the",
        "a",
        "an",
        "in",
        "of",
        "and",
        "is",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "or",
        "as",
        "be",
        "was",
        "are",
        "art",
        "ust",
        "pkt",
        "nr",
        "r",
        "dz",
        "poz",
    }

    # Build per-cluster term frequencies
    cluster_word_counts: dict[int, Counter] = {}
    all_words: set[str] = set()

    for cluster_id, texts in cluster_texts.items():
        combined = " ".join(texts)
        words = [
            w
            for w in combined.split()
            if len(w) > 2 and w not in stopwords and w.isalpha()
        ]
        cluster_word_counts[cluster_id] = Counter(words)
        all_words.update(words)

    # Compute IDF (how many clusters contain this word)
    word_cluster_count: Counter = Counter()
    for counts in cluster_word_counts.values():
        for word in counts:
            word_cluster_count[word] += 1

    # Compute TF-IDF scores per cluster
    keywords: dict[int, list[str]] = {}
    for cluster_id in range(num_clusters):
        counts = cluster_word_counts.get(cluster_id, Counter())
        total_words = sum(counts.values()) or 1

        scores = {}
        for word, count in counts.items():
            tf = count / total_words
            idf = np.log(num_clusters / (word_cluster_count[word] + 1)) + 1
            scores[word] = tf * idf

        top_words = sorted(scores, key=lambda w: scores[w], reverse=True)[:top_n]
        keywords[cluster_id] = top_words if top_words else ["(no keywords)"]

    return keywords


def _compute_pca_2d(embeddings: np.ndarray) -> np.ndarray:
    """
    Reduce high-dimensional embeddings to 2D using PCA.

    Uses a simple covariance-based PCA implementation (no sklearn needed).
    """
    # Center the data
    mean = np.mean(embeddings, axis=0)
    centered = embeddings - mean

    # Compute covariance matrix (use smaller dimension trick for efficiency)
    n, d = centered.shape
    if n < d:
        # Compute n x n covariance (cheaper when n << d)
        cov_small = np.dot(centered, centered.T) / (n - 1)
        eigenvalues, eigenvectors_small = np.linalg.eigh(cov_small)
        # Sort by largest eigenvalue
        idx = np.argsort(eigenvalues)[::-1][:2]
        eigenvectors_small = eigenvectors_small[:, idx]
        # Transform back to d-dimensional space
        eigenvectors = np.dot(centered.T, eigenvectors_small)
        # Normalize
        for i in range(eigenvectors.shape[1]):
            norm = np.linalg.norm(eigenvectors[:, i])
            if norm > 0:
                eigenvectors[:, i] /= norm
    else:
        cov = np.dot(centered.T, centered) / (n - 1)
        eigenvalues, eigenvectors_all = np.linalg.eigh(cov)
        idx = np.argsort(eigenvalues)[::-1][:2]
        eigenvectors = eigenvectors_all[:, idx]

    # Project
    coords = np.dot(centered, eigenvectors)

    # Normalize to [-1, 1] range for visualization
    for dim in range(2):
        col = coords[:, dim]
        range_val = col.max() - col.min()
        if range_val > 0:
            coords[:, dim] = 2 * (col - col.min()) / range_val - 1

    return coords


def _kmeans(
    embeddings: np.ndarray, k: int, max_iter: int = 50
) -> tuple[np.ndarray, np.ndarray]:
    """
    Simple K-Means clustering implementation using numpy.

    Returns (labels, centroids).
    """
    n = embeddings.shape[0]
    rng = np.random.RandomState(42)

    # K-Means++ initialization
    centroids = np.empty((k, embeddings.shape[1]), dtype=np.float32)
    centroids[0] = embeddings[rng.randint(n)]

    for i in range(1, k):
        distances = np.min(
            [np.sum((embeddings - c) ** 2, axis=1) for c in centroids[:i]], axis=0
        )
        total = distances.sum()
        # Fall back to uniform selection when all points match existing centroids
        probs = np.ones(n) / n if total == 0 else distances / total
        centroids[i] = embeddings[rng.choice(n, p=probs)]

    # Iterate
    labels = np.zeros(n, dtype=np.int32)
    for _ in range(max_iter):
        # Assign
        dists = np.array([np.sum((embeddings - c) ** 2, axis=1) for c in centroids]).T
        new_labels = np.argmin(dists, axis=1).astype(np.int32)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        # Update centroids
        for j in range(k):
            mask = labels == j
            if mask.sum() > 0:
                centroids[j] = embeddings[mask].mean(axis=0)

    return labels, centroids


# ===== Endpoints =====


@router.post(
    "/semantic-clusters",
    response_model=ClusteringResponse,
    summary="Cluster documents by semantic similarity",
)
@limiter.limit(CLUSTERING_RATE_LIMIT)
async def get_semantic_clusters(
    http_request: Request, request: ClusteringRequest
) -> ClusteringResponse:
    """
    Cluster documents using their embedding vectors.

    Uses K-Means clustering on existing document embeddings and PCA for
    2D visualization coordinates. Extracts representative keywords per
    cluster using TF-IDF on document titles and summaries.
    """
    start_time = time.perf_counter()
    db = get_vector_db()

    # Fetch documents with embeddings
    select_fields = (
        "document_id, title, document_type, date_issued, summary, keywords, embedding"
    )
    try:
        query = db.client.table("legal_documents").select(select_fields)

        if request.document_types:
            query = query.in_("document_type", request.document_types)

        response = query.limit(request.sample_size).execute()
    except Exception as e:
        logger.error(f"Error fetching documents for clustering: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch documents from database",
        )

    docs = response.data or []

    # Filter to documents with valid embeddings
    docs_with_embeddings = [
        doc
        for doc in docs
        if doc.get("embedding")
        and isinstance(doc["embedding"], list)
        and len(doc["embedding"]) > 0
    ]

    if len(docs_with_embeddings) < request.num_clusters:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough documents with embeddings ({len(docs_with_embeddings)}) "
            f"for {request.num_clusters} clusters. Need at least {request.num_clusters}.",
        )

    # Build embedding matrix
    embeddings = np.array(
        [doc["embedding"] for doc in docs_with_embeddings],
        dtype=np.float32,
    )

    # Normalize for cosine similarity
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized = embeddings / norms

    # K-Means clustering
    labels, centroids = _kmeans(normalized, request.num_clusters)

    # Normalize centroids too
    centroid_norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    centroid_norms[centroid_norms == 0] = 1.0
    centroids_normalized = centroids / centroid_norms

    # PCA for 2D visualization
    coords = _compute_pca_2d(normalized)

    # Extract keywords per cluster
    cluster_keywords = _extract_keywords_tfidf(
        docs_with_embeddings, labels, request.num_clusters
    )

    # Build clusters
    clusters: list[SemanticCluster] = []
    nodes: list[ClusterNode] = []
    edges: list[ClusterEdge] = []

    for cluster_id in range(request.num_clusters):
        mask = labels == cluster_id
        cluster_indices = np.where(mask)[0]

        if len(cluster_indices) == 0:
            continue

        # Compute similarity to centroid for each member
        cluster_embeddings = normalized[cluster_indices]
        centroid = centroids_normalized[cluster_id]
        similarities = np.dot(cluster_embeddings, centroid)
        similarities = np.clip(similarities, 0.0, 1.0)

        # Build cluster documents
        cluster_docs: list[ClusterDocument] = []
        for i, idx in enumerate(cluster_indices):
            doc = docs_with_embeddings[idx]
            cluster_docs.append(
                ClusterDocument(
                    document_id=doc["document_id"],
                    title=doc.get("title"),
                    document_type=doc.get("document_type"),
                    date_issued=(
                        str(doc["date_issued"]) if doc.get("date_issued") else None
                    ),
                    similarity_to_centroid=round(float(similarities[i]), 4),
                )
            )

        # Sort by similarity to centroid (most representative first)
        cluster_docs.sort(key=lambda d: d.similarity_to_centroid, reverse=True)

        coherence = float(np.mean(similarities)) if len(similarities) > 0 else 0.0

        clusters.append(
            SemanticCluster(
                cluster_id=cluster_id,
                size=len(cluster_docs),
                keywords=cluster_keywords.get(cluster_id, ["(no keywords)"]),
                coherence_score=round(coherence, 4),
                documents=cluster_docs,
            )
        )

    # Build nodes for visualization
    for i, doc in enumerate(docs_with_embeddings):
        year = None
        if doc.get("date_issued"):
            with contextlib.suppress(ValueError, TypeError):
                year = int(str(doc["date_issued"])[:4])

        nodes.append(
            ClusterNode(
                id=doc["document_id"],
                title=doc.get("title") or doc["document_id"],
                document_type=doc.get("document_type") or "unknown",
                year=year,
                x=round(float(coords[i, 0]), 4),
                y=round(float(coords[i, 1]), 4),
                cluster_id=int(labels[i]),
            )
        )

    # Build edges between similar documents within the same cluster
    # Only add edges for pairs with high similarity to keep the graph readable
    similarity_threshold = 0.8
    for cluster_id in range(request.num_clusters):
        cluster_indices = np.where(labels == cluster_id)[0]
        if len(cluster_indices) < 2:
            continue

        cluster_embs = normalized[cluster_indices]
        sim_matrix = np.dot(cluster_embs, cluster_embs.T)

        for i in range(len(cluster_indices)):
            for j in range(i + 1, len(cluster_indices)):
                sim = float(sim_matrix[i, j])
                if sim >= similarity_threshold:
                    edges.append(
                        ClusterEdge(
                            source=docs_with_embeddings[cluster_indices[i]][
                                "document_id"
                            ],
                            target=docs_with_embeddings[cluster_indices[j]][
                                "document_id"
                            ],
                            similarity=round(sim, 4),
                        )
                    )

    # Limit edges to prevent performance issues
    edges.sort(key=lambda e: e.similarity, reverse=True)
    edges = edges[:500]

    # Compute statistics
    cluster_sizes = [c.size for c in clusters]
    clustering_time_ms = (time.perf_counter() - start_time) * 1000

    statistics = ClusteringStatistics(
        total_documents=len(docs_with_embeddings),
        num_clusters=len(clusters),
        avg_cluster_size=round(np.mean(cluster_sizes), 1) if cluster_sizes else 0.0,
        min_cluster_size=min(cluster_sizes) if cluster_sizes else 0,
        max_cluster_size=max(cluster_sizes) if cluster_sizes else 0,
        avg_coherence=round(float(np.mean([c.coherence_score for c in clusters])), 4)
        if clusters
        else 0.0,
        clustering_time_ms=round(clustering_time_ms, 2),
    )

    return ClusteringResponse(
        clusters=clusters,
        nodes=nodes,
        edges=edges,
        statistics=statistics,
    )

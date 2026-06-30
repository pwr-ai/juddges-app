"""Legal-question cluster discovery endpoint (#147 split)."""

import json
import time
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.clustering import _compute_pca_2d, _extract_keywords_tfidf, _kmeans
from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_RATE_LIMIT,
)
from .schemas import (
    DiscoveredCase,
    DiscoveredCluster,
    ReasoningLineDiscoveryRequest,
    ReasoningLineDiscoveryResponse,
)
from .similarity import (
    _extract_legal_bases,
)
from .timeline_math import (
    _compute_date_range,
)

router = APIRouter()


@router.post(
    "/discover",
    response_model=ReasoningLineDiscoveryResponse,
    summary="Discover clusters of judgments addressing the same legal question",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def discover_reasoning_lines(
    request: Request, body: ReasoningLineDiscoveryRequest
) -> ReasoningLineDiscoveryResponse:
    """
    Discover reasoning-line clusters by combining embedding similarity with
    shared legal bases.

    Fetches judgments from the database, clusters them using K-Means on
    normalized embeddings, then enriches each cluster with shared
    cited_legislation, coherence scores, date ranges, and representative
    cases. Returns a 2D PCA visualization graph.
    """
    start_time = time.perf_counter()
    db = get_vector_db()

    # Step 1: Fetch judgments with embeddings
    select_fields = (
        "id, case_number, title, summary, decision_date, court_name, "
        "cited_legislation, legal_topics, keywords, embedding, deep_legal_domains"
    )
    try:
        query = db.client.table("judgments").select(select_fields)

        # Apply legal domain filter if provided
        if body.legal_domain_filter:
            query = query.contains("deep_legal_domains", [body.legal_domain_filter])

        response = query.limit(body.sample_size).execute()
    except Exception as e:
        logger.error(f"Error fetching judgments for reasoning-line discovery: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch judgments from database",
        )

    docs = response.data or []
    logger.info(
        f"Fetched {len(docs)} judgments for reasoning-line discovery "
        f"(requested {body.sample_size})"
    )

    # Step 2: Parse and filter to documents with valid embeddings
    # Embeddings may be stored as JSON strings or lists depending on the table
    for doc in docs:
        emb = doc.get("embedding")
        if isinstance(emb, str):
            try:
                doc["embedding"] = json.loads(emb)
            except (json.JSONDecodeError, TypeError):
                doc["embedding"] = None

    docs_with_embeddings = [
        doc
        for doc in docs
        if doc.get("embedding")
        and isinstance(doc["embedding"], list)
        and len(doc["embedding"]) > 0
    ]

    if len(docs_with_embeddings) < body.num_clusters:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Not enough judgments with embeddings ({len(docs_with_embeddings)}) "
                f"for {body.num_clusters} clusters. "
                f"Need at least {body.num_clusters}."
            ),
        )

    # Step 3: Build embedding matrix and L2-normalize
    embeddings = np.array(
        [doc["embedding"] for doc in docs_with_embeddings],
        dtype=np.float32,
    )
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized = embeddings / norms

    # Step 4: K-Means clustering
    labels, centroids = _kmeans(normalized, body.num_clusters)

    # Normalize centroids for cosine similarity computation
    centroid_norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    centroid_norms[centroid_norms == 0] = 1.0
    centroids_normalized = centroids / centroid_norms

    # Step 5: Extract TF-IDF keywords per cluster
    cluster_keywords = _extract_keywords_tfidf(
        docs_with_embeddings, labels, body.num_clusters
    )

    # Step 6: Extract shared legal bases per cluster
    cluster_legal_bases = _extract_legal_bases(
        docs_with_embeddings, labels, body.num_clusters
    )

    # Step 7: PCA 2D coordinates for visualization
    coords = _compute_pca_2d(normalized)

    # Step 8: Build cluster results
    clusters: list[DiscoveredCluster] = []

    for cluster_id in range(body.num_clusters):
        mask = labels == cluster_id
        cluster_indices = np.where(mask)[0]

        if len(cluster_indices) == 0:
            continue

        # Cosine similarity of each member to its centroid
        cluster_embeddings = normalized[cluster_indices]
        centroid = centroids_normalized[cluster_id]
        similarities = np.dot(cluster_embeddings, centroid)
        similarities = np.clip(similarities, 0.0, 1.0)

        # Build case list with similarity scores
        cases: list[DiscoveredCase] = []
        for i, idx in enumerate(cluster_indices):
            doc = docs_with_embeddings[idx]
            cases.append(
                DiscoveredCase(
                    judgment_id=str(doc["id"]),
                    signature=doc.get("case_number"),
                    title=doc.get("title"),
                    court_name=doc.get("court_name"),
                    decision_date=(
                        str(doc["decision_date"]) if doc.get("decision_date") else None
                    ),
                    similarity_to_centroid=round(float(similarities[i]), 4),
                    cited_legislation=doc.get("cited_legislation") or [],
                )
            )

        # Sort by similarity to centroid (most representative first), keep top 10
        cases.sort(key=lambda c: c.similarity_to_centroid, reverse=True)
        top_cases = cases[:10]

        # Coherence = mean cosine similarity to centroid
        coherence = float(np.mean(similarities)) if len(similarities) > 0 else 0.0

        # Auto-label from top 3 keywords
        kw = cluster_keywords.get(cluster_id, ["(no keywords)"])
        label = " / ".join(kw[:3])

        # Date range
        date_range = _compute_date_range(docs_with_embeddings, cluster_indices)

        clusters.append(
            DiscoveredCluster(
                cluster_id=cluster_id,
                label=label,
                keywords=kw,
                legal_bases=cluster_legal_bases.get(cluster_id, []),
                case_count=len(cluster_indices),
                coherence_score=round(coherence, 4),
                date_range=date_range,
                top_cases=top_cases,
            )
        )

    # Step 9: Build visualization nodes
    nodes: list[dict[str, Any]] = []
    for i, doc in enumerate(docs_with_embeddings):
        nodes.append(
            {
                "id": str(doc["id"]),
                "title": doc.get("title") or str(doc["id"]),
                "x": round(float(coords[i, 0]), 4),
                "y": round(float(coords[i, 1]), 4),
                "cluster_id": int(labels[i]),
            }
        )

    # Step 10: Build visualization edges (high-similarity pairs only)
    edges: list[dict[str, Any]] = []
    similarity_threshold = 0.75
    max_edges = 500

    for cluster_id in range(body.num_clusters):
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
                        {
                            "source": str(
                                docs_with_embeddings[cluster_indices[i]]["id"]
                            ),
                            "target": str(
                                docs_with_embeddings[cluster_indices[j]]["id"]
                            ),
                            "similarity": round(sim, 4),
                        }
                    )

    # Keep only the strongest edges to avoid overloading the visualization
    edges.sort(key=lambda e: e["similarity"], reverse=True)
    edges = edges[:max_edges]

    # Step 11: Compute statistics
    processing_time_ms = (time.perf_counter() - start_time) * 1000
    coherence_scores = [c.coherence_score for c in clusters]

    statistics = {
        "total_documents": len(docs_with_embeddings),
        "num_clusters": len(clusters),
        "avg_coherence": round(float(np.mean(coherence_scores)), 4)
        if coherence_scores
        else 0.0,
        "processing_time_ms": round(processing_time_ms, 2),
    }

    visualization = {
        "nodes": nodes,
        "edges": edges,
    }

    logger.info(
        f"Reasoning-line discovery completed: {len(clusters)} clusters from "
        f"{len(docs_with_embeddings)} judgments in {processing_time_ms:.0f}ms"
    )

    return ReasoningLineDiscoveryResponse(
        clusters=clusters,
        statistics=statistics,
        visualization=visualization,
    )

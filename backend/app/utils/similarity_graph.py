"""Similarity graph utility functions for document similarity calculations."""

from collections import deque

import numpy as np
from juddges_search.models import LegalDocument
from loguru import logger


def calculate_cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """
    Calculate cosine similarity between two vectors.

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Cosine similarity score (0.0 to 1.0)
    """
    v1 = np.array(vec1)
    v2 = np.array(vec2)

    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)

    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0

    similarity = dot_product / (norm_v1 * norm_v2)
    # Clamp to [0, 1] range and handle floating point errors
    return float(max(0.0, min(1.0, similarity)))


def calculate_pairwise_similarities(
    documents: list[LegalDocument], threshold: float
) -> list[tuple[str, str, float]]:
    """
    Calculate pairwise similarities between documents using their vector embeddings.

    Args:
        documents: List of documents with vector embeddings
        threshold: Minimum similarity threshold to include an edge

    Returns:
        List of tuples (doc_id_1, doc_id_2, similarity_score)
    """
    edges = []
    n = len(documents)

    logger.info(
        f"Calculating pairwise similarities for {n} documents with threshold {threshold}"
    )

    # Extract vectors for all documents (optimized)
    doc_vectors = []
    doc_ids = []

    for doc in documents:
        if not doc.vectors:
            continue

        # Handle both dict and list vector formats
        if isinstance(doc.vectors, dict):
            vector = doc.vectors.get("base") or (
                next(iter(doc.vectors.values())) if doc.vectors else None
            )
        else:
            vector = doc.vectors

        if vector:
            doc_vectors.append(
                np.array(vector, dtype=np.float32)
            )  # Use float32 for memory efficiency
            doc_ids.append(doc.document_id)

    if len(doc_vectors) < 2:
        logger.warning(f"Not enough documents with vectors: {len(doc_vectors)}")
        return edges

    # Convert to numpy array for efficient computation
    vectors_array = np.array(doc_vectors)

    # Normalize vectors for cosine similarity
    norms = np.linalg.norm(vectors_array, axis=1, keepdims=True)
    norms[norms == 0] = 1  # Avoid division by zero
    normalized_vectors = vectors_array / norms

    # Calculate all pairwise similarities using matrix multiplication
    similarity_matrix = np.dot(normalized_vectors, normalized_vectors.T)

    # Extract edges above threshold (excluding diagonal) - vectorized for performance
    # Use numpy boolean indexing for faster filtering
    upper_triangle_mask = np.triu(
        np.ones((len(doc_ids), len(doc_ids)), dtype=bool), k=1
    )
    threshold_mask = similarity_matrix >= threshold
    edge_mask = upper_triangle_mask & threshold_mask

    # Extract edges from mask
    edge_indices = np.where(edge_mask)
    for i, j in zip(edge_indices[0], edge_indices[1], strict=False):
        similarity = float(max(0.0, min(1.0, similarity_matrix[i, j])))
        edges.append((doc_ids[i], doc_ids[j], similarity))

    logger.info(f"Found {len(edges)} edges above threshold {threshold}")
    return edges


def calculate_clusters(
    documents: list[LegalDocument], edges: list[tuple[str, str, float]]
) -> dict[str, int]:
    """
    Calculate cluster IDs using simple connected components algorithm.

    Args:
        documents: List of documents
        edges: List of edges (doc_id_1, doc_id_2, similarity)

    Returns:
        Dictionary mapping document_id to cluster_id
    """
    logger.info(
        f"Calculating clusters for {len(documents)} documents with {len(edges)} edges"
    )

    # Build adjacency list
    adjacency = {doc.document_id: set() for doc in documents}
    for source, target, _ in edges:
        adjacency[source].add(target)
        adjacency[target].add(source)

    # Find connected components using BFS (optimized with deque)
    visited = set()
    clusters = {}
    cluster_id = 0

    for doc in documents:
        doc_id = doc.document_id
        if doc_id not in visited:
            # BFS to find all nodes in this component (using deque for O(1) popleft)
            queue = deque([doc_id])
            visited.add(doc_id)

            while queue:
                current = queue.popleft()  # O(1) instead of O(n) with list.pop(0)
                clusters[current] = cluster_id

                for neighbor in adjacency[current]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)

            cluster_id += 1

    logger.info(f"Found {cluster_id} clusters")
    return clusters

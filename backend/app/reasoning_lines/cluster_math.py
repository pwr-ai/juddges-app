"""Pure clustering math for reasoning-line discovery.

K-Means, PCA-to-2D and per-cluster TF-IDF keywords, implemented with numpy
only. Moved here from the removed ``app.clustering`` router, whose
``/clustering/semantic-clusters`` endpoint had no caller; the only user is
``app.reasoning_lines.discovery``.
"""

from collections import Counter
from typing import Any

import numpy as np


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

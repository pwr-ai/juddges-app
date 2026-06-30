"""Pure vector/text similarity & legal-basis helpers (#147 split)."""

from collections import Counter
from typing import Any

import numpy as np


def _extract_legal_bases(
    documents: list[dict[str, Any]],
    labels: np.ndarray,
    num_clusters: int,
    top_n: int = 5,
) -> dict[int, list[str]]:
    """
    Extract the most common cited_legislation entries per cluster.

    Counts legislation references across all cluster members and returns
    the top-N most frequent entries for each cluster.
    """
    result: dict[int, list[str]] = {}
    for cluster_id in range(num_clusters):
        legislation_counter: Counter = Counter()
        for doc, label in zip(documents, labels, strict=False):
            if label != cluster_id:
                continue
            cited = doc.get("cited_legislation")
            if cited and isinstance(cited, list):
                legislation_counter.update(cited)

        result[cluster_id] = [
            entry for entry, _ in legislation_counter.most_common(top_n)
        ]
    return result


def _compute_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors, returning 0.0 for zero-norm vectors."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.clip(np.dot(vec_a, vec_b) / (norm_a * norm_b), 0.0, 1.0))


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors.

    Returns 0.0 if either vector has zero norm to avoid division by zero.
    """
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _jaccard_similarity(set_a: set, set_b: set) -> float:
    """Compute Jaccard similarity between two sets.

    Returns 0.0 if both sets are empty.
    """
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _text_overlap_score(query_tokens: set[str], line_tokens: set[str]) -> float:
    """Compute token overlap score between query and line text.

    Uses a simple Jaccard-like metric over lowercased word tokens.
    Returns 0.0 if either set is empty.
    """
    if not query_tokens or not line_tokens:
        return 0.0
    intersection = query_tokens & line_tokens
    # Use the smaller set as denominator for a recall-oriented metric
    return len(intersection) / min(len(query_tokens), len(line_tokens))


def _tokenize(text: str) -> set[str]:
    """Tokenize text into lowercased word tokens, filtering short tokens."""
    import re

    return {w.lower() for w in re.findall(r"\w+", text) if len(w) > 2}


def _lines_share_legal_bases(
    line_a: dict[str, Any], line_b: dict[str, Any], min_overlap: int = 1
) -> tuple[bool, float]:
    """
    Check whether two reasoning lines share at least `min_overlap` legal bases.

    Returns a tuple of (shares_enough, overlap_ratio) where overlap_ratio is
    the Jaccard-like ratio: |intersection| / |smaller set|.
    """
    bases_a = set(line_a.get("legal_bases") or [])
    bases_b = set(line_b.get("legal_bases") or [])

    if not bases_a or not bases_b:
        return False, 0.0

    intersection = bases_a & bases_b
    min_size = min(len(bases_a), len(bases_b))
    overlap_ratio = len(intersection) / min_size if min_size > 0 else 0.0

    return len(intersection) >= min_overlap, overlap_ratio


def _pair_centroid_similarity(
    line_a: dict[str, Any], line_b: dict[str, Any]
) -> float | None:
    """Compute cosine similarity between two lines' avg embeddings, or None if missing."""
    emb_a = line_a.get("avg_embedding")
    emb_b = line_b.get("avg_embedding")
    if not (
        emb_a
        and isinstance(emb_a, list)
        and len(emb_a) > 0
        and emb_b
        and isinstance(emb_b, list)
        and len(emb_b) > 0
    ):
        return None
    vec_a = np.array(emb_a, dtype=np.float32)
    vec_b = np.array(emb_b, dtype=np.float32)
    return _compute_cosine_similarity(vec_a, vec_b)

"""Unit tests for app.utils.similarity_graph module."""

import pytest
from juddges_search.models import LegalDocument

from app.utils.similarity_graph import (
    calculate_clusters,
    calculate_cosine_similarity,
    calculate_pairwise_similarities,
)


def _make_doc(doc_id: str, vectors=None) -> LegalDocument:
    """Helper to create a minimal LegalDocument for testing."""
    return LegalDocument(
        document_id=doc_id,
        document_type="judgment",
        country="PL",
        full_text="test",
        vectors=vectors,
    )


# ---------------------------------------------------------------------------
# calculate_cosine_similarity
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCalculateCosineSimilarity:
    """Tests for calculate_cosine_similarity."""

    def test_identical_vectors(self):
        v = [1.0, 2.0, 3.0]
        assert calculate_cosine_similarity(v, v) == pytest.approx(1.0, abs=1e-6)

    def test_orthogonal_vectors(self):
        v1 = [1.0, 0.0]
        v2 = [0.0, 1.0]
        assert calculate_cosine_similarity(v1, v2) == pytest.approx(0.0, abs=1e-6)

    def test_opposite_vectors_clamped_to_zero(self):
        v1 = [1.0, 0.0]
        v2 = [-1.0, 0.0]
        # Negative cosine should be clamped to 0.0
        assert calculate_cosine_similarity(v1, v2) == 0.0

    def test_zero_vector(self):
        assert calculate_cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0
        assert calculate_cosine_similarity([1.0, 2.0], [0.0, 0.0]) == 0.0

    def test_both_zero_vectors(self):
        assert calculate_cosine_similarity([0.0, 0.0], [0.0, 0.0]) == 0.0

    def test_similar_vectors(self):
        v1 = [1.0, 2.0, 3.0]
        v2 = [1.1, 2.1, 3.1]
        sim = calculate_cosine_similarity(v1, v2)
        assert 0.99 < sim <= 1.0

    def test_result_in_0_1_range(self):
        v1 = [3.0, -1.0, 2.0]
        v2 = [1.0, 4.0, -2.0]
        sim = calculate_cosine_similarity(v1, v2)
        assert 0.0 <= sim <= 1.0


# ---------------------------------------------------------------------------
# calculate_pairwise_similarities
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCalculatePairwiseSimilarities:
    """Tests for calculate_pairwise_similarities."""

    def test_identical_docs(self):
        vec = [1.0, 0.0, 0.0]
        docs = [
            _make_doc("d1", vectors={"base": vec}),
            _make_doc("d2", vectors={"base": vec}),
        ]
        edges = calculate_pairwise_similarities(docs, threshold=0.5)
        assert len(edges) == 1
        assert edges[0][2] == pytest.approx(1.0, abs=1e-4)

    def test_below_threshold_excluded(self):
        docs = [
            _make_doc("d1", vectors={"base": [1.0, 0.0]}),
            _make_doc("d2", vectors={"base": [0.0, 1.0]}),
        ]
        edges = calculate_pairwise_similarities(docs, threshold=0.5)
        assert len(edges) == 0

    def test_no_vectors(self):
        docs = [_make_doc("d1"), _make_doc("d2")]
        edges = calculate_pairwise_similarities(docs, threshold=0.1)
        assert edges == []

    def test_single_document(self):
        docs = [_make_doc("d1", vectors={"base": [1.0, 0.0]})]
        edges = calculate_pairwise_similarities(docs, threshold=0.1)
        assert edges == []

    def test_dict_vectors_with_fallback_key(self):
        """When 'base' key missing, falls back to first value in dict."""
        docs = [
            _make_doc("d1", vectors={"custom": [1.0, 0.0, 0.0]}),
            _make_doc("d2", vectors={"custom": [1.0, 0.1, 0.0]}),
        ]
        edges = calculate_pairwise_similarities(docs, threshold=0.5)
        assert len(edges) >= 1

    def test_three_documents(self):
        docs = [
            _make_doc("d1", vectors={"base": [1.0, 0.0]}),
            _make_doc("d2", vectors={"base": [0.9, 0.1]}),
            _make_doc("d3", vectors={"base": [0.0, 1.0]}),
        ]
        edges = calculate_pairwise_similarities(docs, threshold=0.5)
        # d1-d2 should be similar, d1-d3 and d2-d3 should not
        edge_pairs = {(e[0], e[1]) for e in edges}
        assert ("d1", "d2") in edge_pairs


# ---------------------------------------------------------------------------
# calculate_clusters
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCalculateClusters:
    """Tests for calculate_clusters."""

    def test_no_edges_all_singletons(self):
        docs = [_make_doc("d1"), _make_doc("d2"), _make_doc("d3")]
        clusters = calculate_clusters(docs, [])
        # Each doc in its own cluster
        cluster_ids = set(clusters.values())
        assert len(cluster_ids) == 3

    def test_all_connected(self):
        docs = [_make_doc("d1"), _make_doc("d2"), _make_doc("d3")]
        edges = [("d1", "d2", 0.9), ("d2", "d3", 0.8)]
        clusters = calculate_clusters(docs, edges)
        assert clusters["d1"] == clusters["d2"] == clusters["d3"]

    def test_two_clusters(self):
        docs = [_make_doc("d1"), _make_doc("d2"), _make_doc("d3"), _make_doc("d4")]
        edges = [("d1", "d2", 0.9), ("d3", "d4", 0.8)]
        clusters = calculate_clusters(docs, edges)
        assert clusters["d1"] == clusters["d2"]
        assert clusters["d3"] == clusters["d4"]
        assert clusters["d1"] != clusters["d3"]

    def test_empty_documents(self):
        clusters = calculate_clusters([], [])
        assert clusters == {}

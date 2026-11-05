"""Unit tests for app.reasoning_lines.cluster_math.

Covers the pure helpers (_extract_keywords_tfidf, _compute_pca_2d, _kmeans)
used by reasoning-line discovery.
"""

import numpy as np
import pytest

from app.reasoning_lines.cluster_math import (
    _compute_pca_2d,
    _extract_keywords_tfidf,
    _kmeans,
)

# ===== _extract_keywords_tfidf tests =====


@pytest.mark.unit
class TestExtractKeywordsTfidf:
    def test_basic_keyword_extraction(self):
        docs = [
            {"title": "Contract law analysis", "summary": "legal contract terms"},
            {"title": "Tax regulation update", "summary": "income tax policy"},
            {"title": "Contract dispute resolution", "summary": "contract breach"},
        ]
        labels = np.array([0, 1, 0])
        result = _extract_keywords_tfidf(docs, labels, num_clusters=2, top_n=3)

        assert len(result) == 2
        assert isinstance(result[0], list)
        assert isinstance(result[1], list)

    def test_empty_cluster_gets_no_keywords_marker(self):
        docs = [
            {"title": "Something", "summary": "text"},
        ]
        labels = np.array([0])
        result = _extract_keywords_tfidf(docs, labels, num_clusters=2, top_n=3)

        # Cluster 1 is empty
        assert result[1] == ["(no keywords)"]

    def test_stopwords_filtered(self):
        docs = [
            {"title": "the and for with", "summary": ""},
        ]
        labels = np.array([0])
        result = _extract_keywords_tfidf(docs, labels, num_clusters=1, top_n=5)

        # All words are stopwords or too short, so no keywords
        assert result[0] == ["(no keywords)"]

    def test_keywords_list_from_document(self):
        """Keywords field in documents should be used for extraction."""
        docs = [
            {"title": "", "summary": "", "keywords": ["arbitration", "mediation"]},
        ]
        labels = np.array([0])
        result = _extract_keywords_tfidf(docs, labels, num_clusters=1, top_n=5)

        assert "arbitration" in result[0] or "mediation" in result[0]

    def test_short_words_filtered(self):
        """Words with 2 or fewer characters should be excluded."""
        docs = [
            {"title": "ab cd ef gh", "summary": "ij kl mn"},
        ]
        labels = np.array([0])
        result = _extract_keywords_tfidf(docs, labels, num_clusters=1, top_n=5)
        assert result[0] == ["(no keywords)"]


# ===== _compute_pca_2d tests =====


@pytest.mark.unit
class TestComputePca2d:
    def test_output_shape(self):
        embeddings = np.random.randn(10, 50).astype(np.float32)
        coords = _compute_pca_2d(embeddings)
        assert coords.shape == (10, 2)

    def test_output_range(self):
        """PCA coordinates should be normalized to [-1, 1]."""
        embeddings = np.random.randn(20, 100).astype(np.float32)
        coords = _compute_pca_2d(embeddings)
        assert coords.min() >= -1.01  # small tolerance
        assert coords.max() <= 1.01

    def test_fewer_samples_than_dimensions(self):
        """When n < d, uses the more efficient method."""
        embeddings = np.random.randn(5, 100).astype(np.float32)
        coords = _compute_pca_2d(embeddings)
        assert coords.shape == (5, 2)

    def test_more_samples_than_dimensions(self):
        """When n >= d, uses the standard method."""
        embeddings = np.random.randn(50, 10).astype(np.float32)
        coords = _compute_pca_2d(embeddings)
        assert coords.shape == (50, 2)


# ===== _kmeans tests =====


@pytest.mark.unit
class TestKmeans:
    def test_basic_clustering(self):
        # Two distinct clusters
        cluster_a = np.random.randn(20, 10).astype(np.float32) + 5
        cluster_b = np.random.randn(20, 10).astype(np.float32) - 5
        embeddings = np.vstack([cluster_a, cluster_b])

        labels, centroids = _kmeans(embeddings, k=2)

        assert labels.shape == (40,)
        assert centroids.shape == (2, 10)
        # Each cluster should have some assignments
        assert set(labels.tolist()) == {0, 1}

    def test_returns_correct_number_of_centroids(self):
        embeddings = np.random.randn(50, 10).astype(np.float32)
        labels, centroids = _kmeans(embeddings, k=5)
        assert centroids.shape[0] == 5

    def test_deterministic_with_seed(self):
        embeddings = np.random.randn(30, 10).astype(np.float32)
        labels1, _ = _kmeans(embeddings, k=3)
        labels2, _ = _kmeans(embeddings, k=3)
        np.testing.assert_array_equal(labels1, labels2)

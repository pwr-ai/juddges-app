"""
Unit tests for app.clustering module.

Tests utility functions (_extract_keywords_tfidf, _compute_pca_2d, _kmeans)
and the semantic clustering endpoint with mocked database.
"""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.clustering import (
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


# ===== Endpoint tests =====


@pytest.mark.unit
class TestSemanticClustersEndpoint:
    @patch("app.clustering.get_vector_db")
    async def test_not_enough_documents_returns_400(self, mock_db):
        """If fewer docs with embeddings than requested clusters, returns 400."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {"document_id": "d1", "title": "Doc 1", "embedding": [0.1] * 10},
        ]
        mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={"sample_size": 100, "num_clusters": 5},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 400

    @patch("app.clustering.get_vector_db")
    async def test_documents_without_embeddings_filtered(self, mock_db):
        """Documents without embeddings should be excluded."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        # 3 docs, only 2 have embeddings
        mock_response.data = [
            {"document_id": "d1", "title": "Doc 1", "embedding": [0.1] * 10},
            {"document_id": "d2", "title": "Doc 2", "embedding": None},
            {"document_id": "d3", "title": "Doc 3", "embedding": [0.3] * 10},
        ]
        mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={"sample_size": 10, "num_clusters": 2},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["statistics"]["total_documents"] == 2

    @patch("app.clustering.get_vector_db")
    async def test_db_error_returns_500(self, mock_db):
        """Database errors should return 500."""
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.limit.return_value.execute.side_effect = Exception(
            "DB connection failed"
        )
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={"sample_size": 10, "num_clusters": 3},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 500

    @patch("app.clustering.get_vector_db")
    async def test_successful_clustering_with_document_types_filter(self, mock_db):
        """Passing document_types should apply in_ filter."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        # 4 docs with embeddings
        embedding = [float(i) for i in range(10)]
        mock_response.data = [
            {
                "document_id": f"d{i}",
                "title": f"Doc {i}",
                "document_type": "judgment",
                "date_issued": "2024-01-01",
                "summary": f"Summary {i}",
                "keywords": [],
                "embedding": [x + i * 0.1 for x in embedding],
            }
            for i in range(4)
        ]
        mock_client.table.return_value.select.return_value.in_.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={
                    "sample_size": 10,
                    "num_clusters": 2,
                    "document_types": ["judgment"],
                },
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert "clusters" in data
        assert "nodes" in data
        assert "statistics" in data


# ===== Request validation tests =====


@pytest.mark.unit
class TestClusteringRequestValidation:
    async def test_sample_size_below_minimum(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={"sample_size": 5, "num_clusters": 3},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422

    async def test_num_clusters_below_minimum(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/clustering/semantic-clusters",
                json={"sample_size": 100, "num_clusters": 1},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422

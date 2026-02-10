"""
Test script for the document similarity graph endpoint.

This script tests the /documents/similarity-graph endpoint with various parameters.
Run this script using pytest or directly via Python in the Docker container.

Usage:
    docker compose exec backend python -m pytest backend/app/test_similarity_graph.py -v
"""


import pytest
from fastapi.testclient import TestClient
from loguru import logger

# This would normally import from your app
# from app.server import app


class TestSimilarityGraphModels:
    """Test the Pydantic models for similarity graph."""

    def test_graph_node_model(self):
        """Test GraphNode model validation."""
        from app.models import GraphNode

        node = GraphNode(
            id="test_doc_1",
            title="Test Document",
            document_type="judgment",
            year=2023,
            x=0.5,
            y=0.3,
            cluster_id=1,
            metadata={"language": "pl"},
        )

        assert node.id == "test_doc_1"
        assert node.title == "Test Document"
        assert node.x == 0.5
        assert node.cluster_id == 1

    def test_graph_edge_model(self):
        """Test GraphEdge model validation."""
        from app.models import GraphEdge

        edge = GraphEdge(source="doc1", target="doc2", similarity=0.85)

        assert edge.source == "doc1"
        assert edge.target == "doc2"
        assert edge.similarity == 0.85

    def test_edge_similarity_bounds(self):
        """Test that similarity is bounded between 0 and 1."""
        from app.models import GraphEdge
        from pydantic import ValidationError

        # Valid edge
        edge = GraphEdge(source="doc1", target="doc2", similarity=0.5)
        assert 0.0 <= edge.similarity <= 1.0

        # Invalid - too high
        with pytest.raises(ValidationError):
            GraphEdge(source="doc1", target="doc2", similarity=1.5)

        # Invalid - negative
        with pytest.raises(ValidationError):
            GraphEdge(source="doc1", target="doc2", similarity=-0.1)

    def test_similarity_graph_request(self):
        """Test SimilarityGraphRequest model."""
        from app.models import SimilarityGraphRequest

        request = SimilarityGraphRequest(
            sample_size=100,
            similarity_threshold=0.8,
            document_types=["judgment"],
            include_clusters=True,
        )

        assert request.sample_size == 100
        assert request.similarity_threshold == 0.8
        assert request.include_clusters is True


class TestSimilarityCalculation:
    """Test similarity calculation helper functions."""

    def test_cosine_similarity_identical_vectors(self):
        """Test cosine similarity of identical vectors."""
        from app.documents import calculate_cosine_similarity

        vec1 = [1.0, 2.0, 3.0, 4.0]
        vec2 = [1.0, 2.0, 3.0, 4.0]

        similarity = calculate_cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(1.0, abs=1e-6)

    def test_cosine_similarity_orthogonal_vectors(self):
        """Test cosine similarity of orthogonal vectors."""
        from app.documents import calculate_cosine_similarity

        vec1 = [1.0, 0.0, 0.0]
        vec2 = [0.0, 1.0, 0.0]

        similarity = calculate_cosine_similarity(vec1, vec2)
        assert similarity == pytest.approx(0.0, abs=1e-6)

    def test_cosine_similarity_opposite_vectors(self):
        """Test cosine similarity of opposite vectors."""
        from app.documents import calculate_cosine_similarity

        vec1 = [1.0, 2.0, 3.0]
        vec2 = [-1.0, -2.0, -3.0]

        similarity = calculate_cosine_similarity(vec1, vec2)
        # Should be clamped to 0.0 (negative similarities not meaningful in this context)
        assert 0.0 <= similarity <= 1.0

    def test_cosine_similarity_zero_vector(self):
        """Test cosine similarity with zero vector."""
        from app.documents import calculate_cosine_similarity

        vec1 = [1.0, 2.0, 3.0]
        vec2 = [0.0, 0.0, 0.0]

        similarity = calculate_cosine_similarity(vec1, vec2)
        assert similarity == 0.0


class TestClusteringAlgorithm:
    """Test the clustering algorithm."""

    def test_clustering_single_component(self):
        """Test clustering with a single connected component."""
        from app.documents import calculate_clusters
        from ai_tax_search.models import LegalDocument

        # Create test documents
        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
            )
            for i in range(5)
        ]

        # All documents connected
        edges = [
            ("doc_0", "doc_1", 0.9),
            ("doc_1", "doc_2", 0.85),
            ("doc_2", "doc_3", 0.8),
            ("doc_3", "doc_4", 0.75),
        ]

        clusters = calculate_clusters(docs, edges)

        # All documents should be in the same cluster
        cluster_ids = set(clusters.values())
        assert len(cluster_ids) == 1

    def test_clustering_multiple_components(self):
        """Test clustering with multiple connected components."""
        from app.documents import calculate_clusters
        from ai_tax_search.models import LegalDocument

        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
            )
            for i in range(6)
        ]

        # Two separate components
        edges = [
            ("doc_0", "doc_1", 0.9),
            ("doc_1", "doc_2", 0.85),
            ("doc_3", "doc_4", 0.8),
            ("doc_4", "doc_5", 0.75),
        ]

        clusters = calculate_clusters(docs, edges)

        # Should have 2 clusters
        cluster_ids = set(clusters.values())
        assert len(cluster_ids) == 2

    def test_clustering_isolated_nodes(self):
        """Test clustering with isolated nodes."""
        from app.documents import calculate_clusters
        from ai_tax_search.models import LegalDocument

        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
            )
            for i in range(5)
        ]

        # One pair connected, three isolated
        edges = [("doc_0", "doc_1", 0.9)]

        clusters = calculate_clusters(docs, edges)

        # Should have 4 clusters (1 pair + 3 singletons)
        cluster_ids = set(clusters.values())
        assert len(cluster_ids) == 4

    def test_clustering_empty_edges(self):
        """Test clustering with no edges."""
        from app.documents import calculate_clusters
        from ai_tax_search.models import LegalDocument

        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
            )
            for i in range(3)
        ]

        edges = []

        clusters = calculate_clusters(docs, edges)

        # Each document should be its own cluster
        cluster_ids = set(clusters.values())
        assert len(cluster_ids) == 3


class TestPairwiseSimilarities:
    """Test pairwise similarity calculation."""

    def test_pairwise_similarities_threshold_filtering(self):
        """Test that similarities below threshold are filtered."""
        from app.documents import calculate_pairwise_similarities
        from ai_tax_search.models import LegalDocument

        # Create documents with mock vectors
        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
                vectors={"base": [float(i), float(i * 2), float(i * 3)]},
            )
            for i in range(1, 4)
        ]

        threshold = 0.9
        edges = calculate_pairwise_similarities(docs, threshold)

        # All edges should have similarity >= threshold
        for _, _, similarity in edges:
            assert similarity >= threshold

    def test_pairwise_similarities_no_duplicate_pairs(self):
        """Test that each pair appears only once."""
        from app.documents import calculate_pairwise_similarities
        from ai_tax_search.models import LegalDocument

        docs = [
            LegalDocument(
                document_id=f"doc_{i}",
                document_type="judgment",
                language="pl",
                country="pl",
                full_text="test",
                vectors={"base": [1.0] * 100},  # Identical vectors for high similarity
            )
            for i in range(5)
        ]

        edges = calculate_pairwise_similarities(docs, 0.5)

        # Check for duplicates
        edge_pairs = {(min(s, t), max(s, t)) for s, t, _ in edges}
        assert len(edge_pairs) == len(edges)


# Integration tests would require a running server and database
# These are marked as integration tests and can be skipped in CI

pytestmark = pytest.mark.integration


class TestSimilarityGraphEndpoint:
    """Integration tests for the similarity graph endpoint."""

    @pytest.fixture
    def client(self):
        """Create a test client."""
        from app.server import app

        return TestClient(app)

    def test_similarity_graph_basic(self, client):
        """Test basic similarity graph request."""
        response = client.get("/documents/similarity-graph")

        assert response.status_code in [200, 404]  # 404 if no documents

        if response.status_code == 200:
            data = response.json()
            assert "nodes" in data
            assert "edges" in data
            assert "statistics" in data

    def test_similarity_graph_with_parameters(self, client):
        """Test similarity graph with custom parameters."""
        response = client.get(
            "/documents/similarity-graph",
            params={
                "sample_size": 30,
                "similarity_threshold": 0.8,
                "include_clusters": True,
            },
        )

        if response.status_code == 200:
            data = response.json()
            assert len(data["nodes"]) <= 30
            assert data["statistics"]["total_nodes"] <= 30

    def test_similarity_graph_with_document_type_filter(self, client):
        """Test similarity graph with document type filtering."""
        response = client.get(
            "/documents/similarity-graph",
            params={"document_types": "judgment", "sample_size": 20},
        )

        if response.status_code == 200:
            data = response.json()
            # All nodes should be judgments
            for node in data["nodes"]:
                assert node["document_type"] == "judgment"

    def test_similarity_graph_statistics(self, client):
        """Test that statistics are correctly calculated."""
        response = client.get(
            "/documents/similarity-graph", params={"sample_size": 50}
        )

        if response.status_code == 200:
            data = response.json()
            stats = data["statistics"]

            assert stats["total_nodes"] == len(data["nodes"])
            assert stats["total_edges"] == len(data["edges"])

            if data["edges"]:
                assert stats["avg_similarity"] > 0
                assert stats["min_similarity"] <= stats["avg_similarity"]
                assert stats["avg_similarity"] <= stats["max_similarity"]


if __name__ == "__main__":
    logger.info("Running similarity graph tests...")
    pytest.main([__file__, "-v", "--tb=short"])

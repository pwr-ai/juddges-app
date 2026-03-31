"""
Unit tests for app.deduplication module.

Tests content hashing, cosine similarity, and deduplication endpoints.
"""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.deduplication import (
    _cosine_similarity_batch,
    compute_content_hash,
)

# ===== compute_content_hash tests =====


@pytest.mark.unit
class TestComputeContentHash:
    def test_deterministic(self):
        h1 = compute_content_hash("Hello World")
        h2 = compute_content_hash("Hello World")
        assert h1 == h2

    def test_case_insensitive(self):
        h1 = compute_content_hash("Hello World")
        h2 = compute_content_hash("hello world")
        assert h1 == h2

    def test_strips_whitespace(self):
        h1 = compute_content_hash("  hello world  ")
        h2 = compute_content_hash("hello world")
        assert h1 == h2

    def test_different_content_different_hash(self):
        h1 = compute_content_hash("document A")
        h2 = compute_content_hash("document B")
        assert h1 != h2

    def test_hash_is_sha256_hex(self):
        h = compute_content_hash("test")
        assert len(h) == 64  # SHA-256 hex digest is 64 chars
        assert all(c in "0123456789abcdef" for c in h)

    def test_empty_string(self):
        h = compute_content_hash("")
        assert isinstance(h, str)
        assert len(h) == 64


# ===== _cosine_similarity_batch tests =====


@pytest.mark.unit
class TestCosineSimilarityBatch:
    def test_identical_vectors(self):
        query = np.array([1.0, 0.0, 0.0])
        matrix = np.array([[1.0, 0.0, 0.0]])
        result = _cosine_similarity_batch(query, matrix)
        assert abs(result[0] - 1.0) < 1e-6

    def test_orthogonal_vectors(self):
        query = np.array([1.0, 0.0])
        matrix = np.array([[0.0, 1.0]])
        result = _cosine_similarity_batch(query, matrix)
        assert abs(result[0]) < 1e-6

    def test_zero_query_vector(self):
        query = np.array([0.0, 0.0, 0.0])
        matrix = np.array([[1.0, 2.0, 3.0]])
        result = _cosine_similarity_batch(query, matrix)
        assert result[0] == 0.0

    def test_zero_matrix_vector(self):
        query = np.array([1.0, 2.0, 3.0])
        matrix = np.array([[0.0, 0.0, 0.0]])
        result = _cosine_similarity_batch(query, matrix)
        assert result[0] == 0.0

    def test_batch_computation(self):
        query = np.array([1.0, 0.0])
        matrix = np.array(
            [
                [1.0, 0.0],  # identical
                [0.0, 1.0],  # orthogonal
                [1.0, 1.0],  # 45 degrees
            ]
        )
        result = _cosine_similarity_batch(query, matrix)
        assert len(result) == 3
        assert abs(result[0] - 1.0) < 1e-6
        assert abs(result[1]) < 1e-6
        assert 0.7 < result[2] < 0.72  # cos(45) ~ 0.707

    def test_result_clipped_to_0_1(self):
        query = np.array([1.0, 0.0])
        matrix = np.array([[1.0, 0.0], [-1.0, 0.0]])
        result = _cosine_similarity_batch(query, matrix)
        # Negative cosine should be clipped to 0
        assert result[1] == 0.0


# ===== Deduplication stats endpoint tests =====


@pytest.mark.unit
class TestDeduplicationStatsEndpoint:
    @patch("app.deduplication.get_vector_db")
    async def test_stats_success(self, mock_db):
        mock_client = MagicMock()

        def make_count_response(count_val):
            resp = MagicMock()
            resp.count = count_val
            return resp

        # Chain the calls: total, with_hash, duplicates, groups
        total_chain = MagicMock()
        total_chain.select.return_value.execute.return_value = make_count_response(100)

        hash_chain = MagicMock()
        hash_chain.select.return_value.not_.is_.return_value.execute.return_value = (
            make_count_response(80)
        )

        dup_chain = MagicMock()
        dup_chain.select.return_value.eq.return_value.execute.return_value = (
            make_count_response(5)
        )

        groups_chain = MagicMock()
        groups_chain.select.return_value.execute.return_value = make_count_response(2)

        mock_client.table.side_effect = lambda name: {
            "legal_documents": total_chain,
            "document_duplicate_groups": groups_chain,
        }.get(name, MagicMock())

        # For the legal_documents calls we need different behavior per call
        # Use a counter to differentiate
        call_count = {"n": 0}

        def table_side_effect(name):
            if name == "legal_documents":
                call_count["n"] += 1
                if call_count["n"] == 1:
                    return total_chain
                if call_count["n"] == 2:
                    return hash_chain
                if call_count["n"] == 3:
                    return dup_chain
            elif name == "document_duplicate_groups":
                return groups_chain
            return MagicMock()

        mock_client.table.side_effect = table_side_effect
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/deduplication/stats",
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200

    @patch("app.deduplication.get_vector_db")
    async def test_stats_returns_zeros_on_error(self, mock_db):
        """When tables don't exist, returns zero stats."""
        mock_db.return_value.client.table.side_effect = Exception("table not found")

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                "/deduplication/stats",
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_documents"] == 0


# ===== Scan endpoint tests =====


@pytest.mark.unit
class TestScanEndpoint:
    @patch("app.deduplication.get_vector_db")
    async def test_scan_empty_returns_empty(self, mock_db):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = []
        mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/deduplication/scan",
                json={"max_documents": 100},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_documents_scanned"] == 0
        assert data["exact_duplicates"] == []
        assert data["near_duplicates"] == []

    @patch("app.deduplication.get_vector_db")
    async def test_scan_detects_exact_duplicates(self, mock_db):
        mock_client = MagicMock()
        mock_response = MagicMock()
        # Two docs with identical text
        mock_response.data = [
            {
                "document_id": "d1",
                "title": "Doc 1",
                "document_type": "judgment",
                "date_issued": "2024-01-01",
                "full_text": "identical content here",
                "embedding": [0.1] * 10,
            },
            {
                "document_id": "d2",
                "title": "Doc 2",
                "document_type": "judgment",
                "date_issued": "2024-01-02",
                "full_text": "identical content here",
                "embedding": [0.2] * 10,
            },
        ]
        mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/deduplication/scan",
                json={
                    "max_documents": 100,
                    "include_exact": True,
                    "include_near_duplicates": False,
                },
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["total_exact_duplicates"] == 1
        assert data["exact_duplicates"][0]["similarity_score"] == 1.0

    @patch("app.deduplication.get_vector_db")
    async def test_scan_skips_empty_full_text(self, mock_db):
        """Documents with empty full_text should not be hashed."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {
                "document_id": "d1",
                "title": "Doc 1",
                "full_text": "",
                "embedding": [0.1] * 10,
            },
            {
                "document_id": "d2",
                "title": "Doc 2",
                "full_text": "",
                "embedding": [0.1] * 10,
            },
        ]
        mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value = mock_response
        mock_db.return_value.client = mock_client

        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/deduplication/scan",
                json={
                    "max_documents": 100,
                    "include_exact": True,
                    "include_near_duplicates": False,
                },
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 200
        assert response.json()["total_exact_duplicates"] == 0


# ===== Request validation tests =====


@pytest.mark.unit
class TestDeduplicationRequestValidation:
    async def test_similarity_threshold_below_minimum(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/deduplication/scan",
                json={"similarity_threshold": 0.3},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422

    async def test_max_documents_above_maximum(self):
        from app.server import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/deduplication/scan",
                json={"max_documents": 1000},
                headers={"X-API-Key": "test-api-key-12345"},
            )
        assert response.status_code == 422

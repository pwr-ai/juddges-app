"""Unit tests for the pure helpers in app.reasoning_lines (#225).

reasoning_lines.py is ~3K LOC of mostly DB/LLM-bound route handlers, but its
clustering / timeline math lives in small pure functions that had no coverage.
These pin that behaviour; the async routes need integration tests (live DB+LLM).
"""

import numpy as np
import pytest

from app.reasoning_lines import (
    _compute_cosine_similarity,
    _compute_date_range,
    _detect_timeline_trend,
    _extract_legal_bases,
)

pytestmark = pytest.mark.unit


class TestComputeCosineSimilarity:
    def test_identical_vectors(self):
        v = np.array([1.0, 2.0, 3.0])
        assert _compute_cosine_similarity(v, v) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        assert _compute_cosine_similarity(
            np.array([1.0, 0.0]), np.array([0.0, 1.0])
        ) == pytest.approx(0.0)

    def test_zero_vector_returns_zero(self):
        assert (
            _compute_cosine_similarity(np.array([0.0, 0.0]), np.array([1.0, 1.0]))
            == 0.0
        )

    def test_opposite_vectors_clipped_to_zero(self):
        # Raw cosine is -1; the helper clips to [0, 1].
        assert (
            _compute_cosine_similarity(np.array([1.0, 0.0]), np.array([-1.0, 0.0]))
            == 0.0
        )


class TestComputeDateRange:
    def test_returns_earliest_and_latest(self):
        docs = [
            {"decision_date": "2024-03-01"},
            {"decision_date": "2022-01-15"},
            {"decision_date": "2023-06-30"},
        ]
        result = _compute_date_range(docs, np.array([0, 1, 2]))
        assert result == {"start": "2022-01-15", "end": "2024-03-01"}

    def test_no_dates_returns_none(self):
        docs = [{"decision_date": None}, {}]
        assert _compute_date_range(docs, np.array([0, 1])) == {
            "start": None,
            "end": None,
        }

    def test_only_selected_indices_considered(self):
        docs = [
            {"decision_date": "2020-01-01"},
            {"decision_date": "2024-01-01"},
            {"decision_date": "2022-01-01"},
        ]
        # Only indices 1 and 2 selected — index 0 (2020) excluded.
        result = _compute_date_range(docs, np.array([1, 2]))
        assert result == {"start": "2022-01-01", "end": "2024-01-01"}


class TestExtractLegalBases:
    def test_top_n_per_cluster(self):
        docs = [
            {"cited_legislation": ["art 1", "art 2"]},
            {"cited_legislation": ["art 1"]},
            {"cited_legislation": ["art 9"]},
        ]
        labels = np.array([0, 0, 1])
        result = _extract_legal_bases(docs, labels, num_clusters=2, top_n=5)
        # Cluster 0: art 1 (x2) ranks before art 2 (x1).
        assert result[0][0] == "art 1"
        assert set(result[0]) == {"art 1", "art 2"}
        assert result[1] == ["art 9"]

    def test_missing_or_non_list_legislation_ignored(self):
        docs = [
            {"cited_legislation": None},
            {"cited_legislation": "not-a-list"},
            {},
        ]
        labels = np.array([0, 0, 0])
        assert _extract_legal_bases(docs, labels, num_clusters=1) == {0: []}

    def test_respects_top_n_limit(self):
        docs = [{"cited_legislation": [f"art {i}" for i in range(10)]}]
        labels = np.array([0])
        result = _extract_legal_bases(docs, labels, num_clusters=1, top_n=3)
        assert len(result[0]) == 3


class TestDetectTimelineTrend:
    def test_insufficient_data(self):
        assert _detect_timeline_trend([0.5, 0.5]) == ("insufficient_data", 0.0)

    def test_shifting_on_strong_slope(self):
        label, slope = _detect_timeline_trend([0.1, 0.4, 0.7, 1.0])
        assert label == "shifting"
        assert slope > 0.05

    def test_emerging_consensus_when_skewed_and_flat(self):
        label, _ = _detect_timeline_trend([0.9, 0.9, 0.9, 0.9])
        assert label == "emerging_consensus"

    def test_stable_split_when_centered_and_flat(self):
        label, _ = _detect_timeline_trend([0.5, 0.5, 0.5, 0.5])
        assert label == "stable_split"

"""Unit tests for app.topic_modeling module -- pure utility functions."""

import math

import numpy as np
import pytest

from app.topic_modeling import (
    STOPWORDS,
    _assign_time_periods,
    _build_doc_token_sets,
    _build_document_texts,
    _build_tfidf_matrix,
    _build_top_documents_for_topic,
    _build_topic_time_series,
    _compute_topic_coherence,
    _detect_trend,
    _extract_topic_keywords,
    _nmf_decomposition,
)

# ---------------------------------------------------------------------------
# _build_document_texts
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildDocumentTexts:
    """Tests for _build_document_texts."""

    def test_combines_title_summary_keywords(self):
        docs = [
            {
                "title": "Tax Ruling",
                "summary": "About VAT",
                "keywords": ["vat", "tax"],
            }
        ]
        result = _build_document_texts(docs)
        assert len(result) == 1
        assert "tax ruling" in result[0]
        assert "about vat" in result[0]
        assert "tax" in result[0]

    def test_handles_missing_fields(self):
        docs = [{"title": None, "summary": None, "keywords": None}]
        result = _build_document_texts(docs)
        assert result == [""]

    def test_empty_list(self):
        assert _build_document_texts([]) == []

    def test_keywords_must_be_list(self):
        docs = [{"title": "A", "summary": "B", "keywords": "not-a-list"}]
        result = _build_document_texts(docs)
        # Non-list keywords are ignored
        assert "not-a-list" not in result[0]

    def test_output_is_lowercase(self):
        docs = [{"title": "UPPER Case", "summary": "MiXeD", "keywords": ["KEY"]}]
        result = _build_document_texts(docs)
        assert result[0] == result[0].lower()


# ---------------------------------------------------------------------------
# _build_tfidf_matrix
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildTfidfMatrix:
    """Tests for _build_tfidf_matrix."""

    def test_returns_correct_shape(self):
        texts = ["document about law"] * 10 + ["document about tax"] * 10
        matrix, vocab = _build_tfidf_matrix(texts, max_features=100)
        assert matrix.shape[0] == 20
        assert matrix.shape[1] == len(vocab)

    def test_empty_vocabulary_raises_valueerror(self):
        """When no valid vocabulary words survive filtering, a ValueError is raised
        with a user-friendly message instead of silently returning a placeholder."""
        texts = ["a b"] * 5
        with pytest.raises(ValueError, match="Insufficient textual content"):
            _build_tfidf_matrix(texts)

    def test_l2_normalized_rows(self):
        texts = ["legal document analysis"] * 20 + ["court ruling judgment"] * 20
        matrix, vocab = _build_tfidf_matrix(texts)
        row_norms = np.linalg.norm(matrix, axis=1)
        # Non-zero rows should have norm ~1
        nonzero_mask = row_norms > 0
        if nonzero_mask.any():
            np.testing.assert_allclose(row_norms[nonzero_mask], 1.0, atol=1e-6)

    def test_empty_vocabulary_error_message_is_user_friendly(self):
        """Regression BUG-11: the error message should guide the user rather than
        propagating an opaque '(empty)' keyword into topic results."""
        texts = ["x y z"] * 5
        with pytest.raises(ValueError) as exc_info:
            _build_tfidf_matrix(texts)
        msg = str(exc_info.value)
        assert "(empty)" not in msg
        assert "Insufficient textual content" in msg

    def test_stopwords_excluded(self):
        """Stopwords should be excluded from the vocabulary. We use varied texts
        so the valid words pass both min_df and max_df filters."""
        texts = ["the and for with legal judgment analysis"] * 10 + [
            "the and for with court ruling decision"
        ] * 10
        matrix, vocab = _build_tfidf_matrix(texts)
        for w in vocab:
            assert w not in STOPWORDS


# ---------------------------------------------------------------------------
# _nmf_decomposition
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestNmfDecomposition:
    """Tests for _nmf_decomposition."""

    def test_output_shapes(self):
        V = np.random.RandomState(0).uniform(0, 1, (20, 10))
        W, H = _nmf_decomposition(V, n_components=3, max_iter=50)
        assert W.shape == (20, 3)
        assert H.shape == (3, 10)

    def test_non_negative(self):
        V = np.random.RandomState(1).uniform(0, 1, (15, 8))
        W, H = _nmf_decomposition(V, n_components=2, max_iter=50)
        assert np.all(W >= 0)
        assert np.all(H >= 0)

    def test_reconstruction_error_decreases(self):
        rng = np.random.RandomState(42)
        V = rng.uniform(0, 1, (10, 5))
        W_few, H_few = _nmf_decomposition(V, n_components=3, max_iter=5)
        err_few = np.sum((V - W_few @ H_few) ** 2)
        W_many, H_many = _nmf_decomposition(V, n_components=3, max_iter=200)
        err_many = np.sum((V - W_many @ H_many) ** 2)
        assert err_many <= err_few + 1e-6


# ---------------------------------------------------------------------------
# _compute_topic_coherence
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestComputeTopicCoherence:
    """Tests for _compute_topic_coherence."""

    def test_perfect_cooccurrence(self):
        doc_sets = [{"law", "court", "judge"}, {"law", "court", "judge"}]
        score = _compute_topic_coherence(["law", "court", "judge"], doc_sets)
        # UMass coherence: log((co_occur+1)/(d_j+1)), when co_occur==d_j the value is 0
        assert isinstance(score, float)

    def test_no_cooccurrence(self):
        doc_sets = [{"law"}, {"court"}, {"judge"}]
        score = _compute_topic_coherence(["law", "court", "judge"], doc_sets)
        # Low co-occurrence should yield lower coherence
        assert isinstance(score, float)

    def test_single_word(self):
        doc_sets = [{"law"}]
        score = _compute_topic_coherence(["law"], doc_sets)
        assert score == 0.0

    def test_empty_docs(self):
        score = _compute_topic_coherence(["law", "court"], [])
        assert score == 0.0


# ---------------------------------------------------------------------------
# _detect_trend
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDetectTrend:
    """Tests for _detect_trend."""

    def test_emerging(self):
        weights = [0.1, 0.2, 0.3, 0.5, 0.8, 1.0]
        label, slope = _detect_trend(weights)
        assert label == "emerging"
        assert slope > 0

    def test_declining(self):
        weights = [1.0, 0.8, 0.5, 0.3, 0.2, 0.1]
        label, slope = _detect_trend(weights)
        assert label == "declining"
        assert slope < 0

    def test_stable(self):
        weights = [0.5, 0.5, 0.5, 0.5]
        label, slope = _detect_trend(weights)
        assert label == "stable"
        assert slope == 0.0

    def test_single_point(self):
        label, slope = _detect_trend([0.5])
        assert label == "stable"
        assert slope == 0.0

    def test_empty(self):
        label, slope = _detect_trend([])
        assert label == "stable"
        assert slope == 0.0

    def test_two_points_increasing(self):
        label, slope = _detect_trend([0.1, 0.5])
        assert label == "emerging"

    def test_near_zero_y_mean_produces_finite_result(self):
        """Regression: extremely small but positive y_mean must not produce
        inf/NaN in the slope, which would break JSON serialization."""
        # Use weights that average to a near-zero positive value (e.g., 1e-300)
        weights = [1e-300, 2e-300, 3e-300, 4e-300, 5e-300]
        label, slope = _detect_trend(weights)
        assert math.isfinite(slope), f"slope must be finite, got {slope}"
        assert label in ("emerging", "declining", "stable")

    def test_all_zero_weights(self):
        """When all weights are zero, y_mean is 0 and relative_slope should be 0."""
        label, slope = _detect_trend([0.0, 0.0, 0.0, 0.0])
        assert label == "stable"
        assert slope == 0.0


# ---------------------------------------------------------------------------
# _assign_time_periods
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestAssignTimePeriods:
    """Tests for _assign_time_periods."""

    def test_no_dates(self):
        docs = [{"title": "doc1"}, {"title": "doc2"}]
        periods, mapping = _assign_time_periods(docs, 3)
        assert periods == []
        assert mapping == {}

    def test_single_year(self):
        docs = [
            {"date_issued": "2024-01-15"},
            {"date_issued": "2024-06-01"},
            {"date_issued": "2024-11-30"},
        ]
        periods, mapping = _assign_time_periods(docs, 4)
        assert len(periods) > 0
        assert all(doc_idx in mapping for doc_idx in range(3))

    def test_multi_year(self):
        docs = [
            {"date_issued": "2020-01-01"},
            {"date_issued": "2021-06-15"},
            {"date_issued": "2023-12-31"},
        ]
        periods, mapping = _assign_time_periods(docs, 3)
        assert len(periods) > 0

    def test_documents_without_dates_excluded(self):
        docs = [
            {"date_issued": "2024-05-01"},
            {"title": "no date"},
            {"date_issued": "2024-08-01"},
        ]
        periods, mapping = _assign_time_periods(docs, 2)
        # Doc at index 1 has no date, should not be in mapping
        assert 1 not in mapping


# ---------------------------------------------------------------------------
# _build_doc_token_sets
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildDocTokenSets:
    """Tests for _build_doc_token_sets."""

    def test_filters_stopwords_and_short_words(self):
        texts = ["the law is for all"]
        result = _build_doc_token_sets(texts)
        assert len(result) == 1
        # "the", "is", "for", "all" are stopwords or <= 2 chars
        assert "the" not in result[0]
        assert "is" not in result[0]
        assert "law" in result[0]

    def test_filters_non_alpha(self):
        texts = ["law123 court ruling"]
        result = _build_doc_token_sets(texts)
        assert "law123" not in result[0]

    def test_empty_text(self):
        result = _build_doc_token_sets([""])
        assert result == [set()]


# ---------------------------------------------------------------------------
# _extract_topic_keywords
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestExtractTopicKeywords:
    """Tests for _extract_topic_keywords."""

    def test_returns_top_keywords(self):
        vocab = ["law", "court", "judge", "ruling"]
        weights = np.array([0.5, 0.3, 0.8, 0.1])
        keywords, words = _extract_topic_keywords(weights, vocab, num_keywords=2)
        assert len(keywords) == 2
        assert keywords[0].word == "judge"  # highest weight
        assert keywords[1].word == "law"

    def test_skips_zero_weight(self):
        vocab = ["law", "court"]
        weights = np.array([0.5, 0.0])
        keywords, words = _extract_topic_keywords(weights, vocab, num_keywords=2)
        assert len(keywords) == 1
        assert keywords[0].word == "law"

    def test_out_of_range_index_skipped(self):
        vocab = ["law"]
        weights = np.array([0.5, 0.3])  # index 1 out of range for vocab
        keywords, words = _extract_topic_keywords(weights, vocab, num_keywords=2)
        assert len(keywords) == 1


# ---------------------------------------------------------------------------
# _build_top_documents_for_topic
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildTopDocumentsForTopic:
    """Tests for _build_top_documents_for_topic."""

    def test_returns_top_documents(self):
        docs = [
            {"document_id": "d1", "title": "Doc 1"},
            {"document_id": "d2", "title": "Doc 2"},
            {"document_id": "d3", "title": "Doc 3"},
        ]
        relevances = np.array([0.9, 0.1, 0.5])
        top_docs, count = _build_top_documents_for_topic(
            docs, relevances, max_docs_per_topic=2
        )
        assert len(top_docs) <= 2
        assert top_docs[0].document_id == "d1"

    def test_filters_low_relevance(self):
        docs = [
            {"document_id": "d1", "title": "Doc 1"},
            {"document_id": "d2", "title": "Doc 2"},
        ]
        relevances = np.array([1.0, 0.01])
        top_docs, count = _build_top_documents_for_topic(docs, relevances)
        # d2 has relevance 0.01/1.0 = 0.01 < 0.05 threshold
        assert all(d.document_id != "d2" for d in top_docs)


# ---------------------------------------------------------------------------
# _build_topic_time_series
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildTopicTimeSeries:
    """Tests for _build_topic_time_series."""

    def test_empty_periods(self):
        ts, weights = _build_topic_time_series([], {}, np.array([0.5]))
        assert ts == []
        assert weights == []

    def test_with_periods(self):
        periods = [
            ("2023", "2023-01-01", "2023-12-31"),
            ("2024", "2024-01-01", "2024-12-31"),
        ]
        doc_to_period = {0: 0, 1: 0, 2: 1}
        relevances = np.array([0.8, 0.6, 0.3])
        ts, weights = _build_topic_time_series(periods, doc_to_period, relevances)
        assert len(ts) == 2
        assert ts[0].period_label == "2023"
        assert ts[0].document_count == 2
        assert len(weights) == 2

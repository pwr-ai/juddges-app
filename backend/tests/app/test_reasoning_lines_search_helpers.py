"""Unit tests for additional pure helpers in app.reasoning_lines (#225).

Complements test_reasoning_lines_helpers.py (clustering/timeline math) by covering
the similarity, tokenization, keyword-extraction, legal-base overlap, centroid, and
time-bucketing helpers that back the semantic-search, drift, and event-detection
routes. All are pure functions; the async routes still need integration tests.
"""

import numpy as np
import pytest

from app.reasoning_lines import (
    _bucket_members_by_period,
    _cosine_similarity,
    _extract_window_keywords,
    _jaccard_similarity,
    _lines_share_legal_bases,
    _pair_centroid_similarity,
    _text_overlap_score,
    _tokenize,
)

pytestmark = pytest.mark.unit


class TestCosineSimilarity:
    def test_identical_vectors(self):
        v = np.array([1.0, 2.0, 3.0])
        assert _cosine_similarity(v, v) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        assert _cosine_similarity(
            np.array([1.0, 0.0]), np.array([0.0, 1.0])
        ) == pytest.approx(0.0)

    def test_zero_norm_returns_zero(self):
        assert _cosine_similarity(np.array([0.0, 0.0]), np.array([1.0, 1.0])) == 0.0


class TestJaccardSimilarity:
    def test_both_empty_returns_zero(self):
        assert _jaccard_similarity(set(), set()) == 0.0

    def test_identical_sets(self):
        assert _jaccard_similarity({"a", "b"}, {"a", "b"}) == 1.0

    def test_disjoint_sets(self):
        assert _jaccard_similarity({"a"}, {"b"}) == 0.0

    def test_partial_overlap(self):
        # intersection =1 ({"b"}), union =3 ({"a","b","c"})
        assert _jaccard_similarity({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


class TestTextOverlapScore:
    def test_empty_side_returns_zero(self):
        assert _text_overlap_score(set(), {"a"}) == 0.0
        assert _text_overlap_score({"a"}, set()) == 0.0

    def test_uses_smaller_set_as_denominator(self):
        # intersection = {"b"}; smaller set has size 1 -> recall-oriented score 1.0
        assert _text_overlap_score({"b"}, {"a", "b", "c"}) == 1.0

    def test_partial_overlap(self):
        # intersection = {"b"} (size 1); min(|q|,|l|) = 2 -> 0.5
        assert _text_overlap_score({"a", "b"}, {"b", "c"}) == pytest.approx(0.5)


class TestTokenize:
    def test_lowercases_and_drops_short_tokens(self):
        assert _tokenize("The Court of Appeal") == {"the", "court", "appeal"}

    def test_splits_on_non_word_chars(self):
        # hyphen/punctuation are word boundaries: "sec-tion" -> {"sec", "tion"}
        assert _tokenize("art. 123, sec-tion!") == {"art", "123", "sec", "tion"}

    def test_empty_text_returns_empty_set(self):
        assert _tokenize("a, of, to") == set()  # all tokens <= 2 chars


class TestLinesShareLegalBases:
    def test_missing_bases_on_either_side(self):
        assert _lines_share_legal_bases(
            {"legal_bases": []}, {"legal_bases": ["x"]}
        ) == (False, 0.0)
        assert _lines_share_legal_bases({}, {"legal_bases": ["x"]}) == (False, 0.0)

    def test_overlap_ratio_uses_smaller_set(self):
        shares, ratio = _lines_share_legal_bases(
            {"legal_bases": ["a", "b"]}, {"legal_bases": ["b", "c", "d"]}
        )
        assert shares is True
        assert ratio == pytest.approx(0.5)  # intersection =1 / min(2,3)=2

    def test_min_overlap_threshold_not_met(self):
        shares, ratio = _lines_share_legal_bases(
            {"legal_bases": ["a", "b"]}, {"legal_bases": ["b", "c"]}, min_overlap=2
        )
        assert shares is False  # only 1 shared base, need 2
        assert ratio == pytest.approx(0.5)


class TestPairCentroidSimilarity:
    def test_missing_or_empty_embedding_returns_none(self):
        assert (
            _pair_centroid_similarity({"avg_embedding": []}, {"avg_embedding": [1.0]})
            is None
        )
        assert _pair_centroid_similarity({}, {"avg_embedding": [1.0]}) is None
        assert (
            _pair_centroid_similarity(
                {"avg_embedding": "nope"}, {"avg_embedding": [1.0]}
            )
            is None
        )

    def test_valid_embeddings_return_cosine(self):
        sim = _pair_centroid_similarity(
            {"avg_embedding": [1.0, 0.0]}, {"avg_embedding": [1.0, 0.0]}
        )
        assert sim == pytest.approx(1.0)


class TestExtractWindowKeywords:
    def test_ranks_by_frequency_and_respects_top_n(self):
        judgments = [
            {"title": "alphaword alphaword", "summary": "betaword"},
            {"title": "alphaword", "summary": "betaword gammaword"},
        ]
        # alphaword x3, betaword x2, gammaword x1
        assert _extract_window_keywords(judgments, top_n=2) == ["alphaword", "betaword"]

    def test_filters_short_and_non_alpha_tokens(self):
        judgments = [{"title": "ab 123 longword", "summary": ""}]
        # "ab" too short, "123" non-alpha -> only "longword" survives
        assert _extract_window_keywords(judgments) == ["longword"]

    def test_empty_window_returns_empty(self):
        assert _extract_window_keywords([]) == []


class TestBucketMembersByPeriod:
    def test_no_valid_dates_returns_empty(self):
        periods, buckets = _bucket_members_by_period(
            [{"id": 1}, {"decision_date": None}]
        )
        assert periods == []
        assert buckets == []

    def test_year_bucketing_for_wide_span(self):
        members = [{"decision_date": "2018-03-01"}, {"decision_date": "2023-09-01"}]
        periods, buckets = _bucket_members_by_period(members)
        labels = [p["period_label"] for p in periods]
        assert labels == ["2018", "2019", "2020", "2021", "2022", "2023"]
        assert buckets[0] == [{"decision_date": "2018-03-01"}]
        assert buckets[-1] == [{"decision_date": "2023-09-01"}]

    def test_quarter_bucketing_for_medium_span(self):
        members = [{"decision_date": "2020-02-15"}, {"decision_date": "2021-08-10"}]
        periods, _ = _bucket_members_by_period(members)
        labels = [p["period_label"] for p in periods]
        assert labels[0] == "2020-Q1"
        assert "2021-Q3" in labels

    def test_month_bucketing_for_narrow_span(self):
        members = [{"decision_date": "2022-01-05"}, {"decision_date": "2022-03-20"}]
        periods, buckets = _bucket_members_by_period(members)
        labels = [p["period_label"] for p in periods]
        assert labels == ["2022-01", "2022-02", "2022-03"]
        assert buckets[0] == [{"decision_date": "2022-01-05"}]
        assert buckets[1] == []  # nothing in February

"""Unit tests for the offline search-eval ranking metrics (issue #831)."""

import math

import pytest

from evals.search.metrics import (
    mean,
    ndcg_at_k,
    percentile,
    recall_at_k,
    reciprocal_rank,
)

pytestmark = pytest.mark.unit


# ── recall@k ────────────────────────────────────────────────────────────────


def test_recall_single_label_found_and_missed():
    assert recall_at_k([0, 0, 3], [3], k=10) == 1.0
    assert recall_at_k([0, 0, 3], [3], k=2) == 0.0


def test_recall_counts_only_top_k():
    assert recall_at_k([1, 0, 1, 1], [1, 1, 1, 1], k=2) == pytest.approx(1 / 2)


def test_recall_is_capped_by_k_so_a_perfect_ranking_scores_one():
    # 40 labelled docs, a top 10 made only of relevant ones: plain recall
    # would be 0.25; the capped variant reads 1.0.
    assert recall_at_k([1] * 10, [1] * 40, k=10) == 1.0
    assert recall_at_k([1] * 5 + [0] * 5, [1] * 40, k=10) == pytest.approx(0.5)


def test_recall_without_labels_is_zero():
    assert recall_at_k([1, 1], [], k=10) == 0.0


def test_recall_on_empty_result_list():
    assert recall_at_k([], [3, 2], k=10) == 0.0


# ── nDCG@k ──────────────────────────────────────────────────────────────────


def test_ndcg_perfect_ranking_is_one():
    assert ndcg_at_k([3, 2, 1], [1, 2, 3], k=10) == pytest.approx(1.0)


def test_ndcg_hand_computed_value():
    # ranked grades [0, 3]; ideal [3]. DCG = 7/log2(3), IDCG = 7/log2(2) = 7.
    expected = (7 / math.log2(3)) / 7
    assert ndcg_at_k([0, 3], [3], k=10) == pytest.approx(expected)


def test_ndcg_rewards_higher_grade_first():
    better = ndcg_at_k([3, 1], [3, 1], k=10)
    worse = ndcg_at_k([1, 3], [3, 1], k=10)
    assert better == pytest.approx(1.0)
    assert worse < better


def test_ndcg_penalises_low_grade_where_high_grade_exists():
    # Returning only the grade-1 doc while a grade-3 doc exists is not perfect.
    assert ndcg_at_k([1], [3, 1], k=10) < 0.2


def test_ndcg_ideal_is_truncated_at_k():
    # 5 grade-1 labels, k=2, both slots relevant -> perfect at k=2.
    assert ndcg_at_k([1, 1, 0], [1] * 5, k=2) == pytest.approx(1.0)


def test_ndcg_without_labels_or_hits():
    assert ndcg_at_k([1, 2], [], k=10) == 0.0
    assert ndcg_at_k([], [2], k=10) == 0.0
    assert ndcg_at_k([0, 0, 0], [2], k=10) == 0.0


# ── reciprocal rank ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("ranked", "k", "expected"),
    [
        ([3, 0, 0], 10, 1.0),
        ([0, 2, 0], 10, 0.5),
        ([0, 0, 0, 1], 10, 0.25),
        ([0, 0, 0, 1], 3, 0.0),
        ([], 10, 0.0),
    ],
)
def test_reciprocal_rank(ranked, k, expected):
    assert reciprocal_rank(ranked, k) == pytest.approx(expected)


@pytest.mark.parametrize("fn", [recall_at_k, ndcg_at_k])
def test_k_must_be_positive(fn):
    with pytest.raises(ValueError, match="k must be"):
        fn([1], [1], 0)


def test_reciprocal_rank_k_must_be_positive():
    with pytest.raises(ValueError, match="k must be"):
        reciprocal_rank([1], 0)


# ── percentile / mean ──────────────────────────────────────────────────────


def test_percentile_matches_numpy_linear_interpolation():
    values = [10.0, 20.0, 30.0, 40.0]
    assert percentile(values, 50) == pytest.approx(25.0)
    assert percentile(values, 95) == pytest.approx(38.5)
    assert percentile(values, 0) == 10.0
    assert percentile(values, 100) == 40.0


def test_percentile_is_order_independent_and_handles_one_value():
    assert percentile([40.0, 10.0, 30.0, 20.0], 50) == pytest.approx(25.0)
    assert percentile([7.0], 95) == 7.0


def test_percentile_rejects_empty_and_out_of_range():
    with pytest.raises(ValueError):
        percentile([], 50)
    with pytest.raises(ValueError):
        percentile([1.0], 101)


def test_mean():
    assert mean([1.0, 0.0, 0.5]) == pytest.approx(0.5)
    assert mean([]) == 0.0

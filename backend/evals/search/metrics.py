"""Ranking metrics for the offline search evaluation (issue #831).

Every function here is pure and works on *grades*, not documents:

* ``ranked`` is the grade of each retrieved document in rank order
  (``0`` = not relevant). Matching documents to labels is the job of
  :func:`evals.search.golden.grade_hits`, so these functions never need to know
  what a judgment id or a case number looks like.
* ``relevant`` is the grade of every labelled relevant document for the query,
  retrieved or not. It is what the ideal ranking for nDCG is built from and
  what recall divides by.

A grade is an int >= 1 for a relevant document; the golden set uses 1-3.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence


def _check_k(k: int) -> None:
    if k < 1:
        raise ValueError(f"k must be >= 1, got {k}")


def recall_at_k(ranked: Sequence[int], relevant: Sequence[int], k: int) -> float:
    """Share of the relevant documents found in the top ``k``.

    The denominator is ``min(k, len(relevant))``, not ``len(relevant)``: a
    query with 40 labelled documents can only ever surface 10 of them in a top
    10, and plain recall would cap it at 0.25 for a perfect ranking. With the
    cap a perfect ranking scores 1.0 whatever the label count, so recall reads
    the same across exact-lookup queries (1 label) and topical ones (dozens).
    For queries with at most ``k`` labels it equals plain recall.

    Returns 0.0 for a query with no relevant labels.
    """
    _check_k(k)
    if not relevant:
        return 0.0
    found = sum(1 for grade in ranked[:k] if grade > 0)
    return found / min(k, len(relevant))


def _dcg(grades: Sequence[int]) -> float:
    # Exponential gain (2^g - 1) so a grade-3 hit outweighs three grade-1 hits;
    # rank i (0-based) is discounted by log2(i + 2).
    return sum((2**g - 1) / math.log2(i + 2) for i, g in enumerate(grades) if g > 0)


def ndcg_at_k(ranked: Sequence[int], relevant: Sequence[int], k: int) -> float:
    """Normalised discounted cumulative gain at ``k`` with graded relevance.

    The ideal ranking is the ``k`` highest labelled grades, so a system that
    returns a grade-1 document where a grade-3 one exists is penalised even if
    both are "relevant". Returns 0.0 for a query with no relevant labels.
    """
    _check_k(k)
    ideal = _dcg(sorted((g for g in relevant if g > 0), reverse=True)[:k])
    if ideal == 0:
        return 0.0
    return _dcg(ranked[:k]) / ideal


def reciprocal_rank(ranked: Sequence[int], k: int) -> float:
    """``1 / rank`` of the first relevant document in the top ``k``, else 0.0.

    Averaged over queries this is MRR@k. Any grade >= 1 counts as relevant.
    """
    _check_k(k)
    for i, grade in enumerate(ranked[:k]):
        if grade > 0:
            return 1.0 / (i + 1)
    return 0.0


def percentile(values: Sequence[float], p: float) -> float:
    """Linear-interpolated percentile (``p`` in 0-100), as numpy's default.

    Used for latency p50/p95. Raises ``ValueError`` on an empty sequence:
    a latency percentile over zero calls is a bug in the caller, not a zero.
    """
    if not values:
        raise ValueError("percentile of an empty sequence")
    if not 0 <= p <= 100:
        raise ValueError(f"p must be in [0, 100], got {p}")
    ordered = sorted(values)
    pos = (len(ordered) - 1) * p / 100
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(ordered[lo])
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def mean(values: Sequence[float]) -> float:
    """Arithmetic mean; 0.0 for an empty sequence (an empty slice has no score)."""
    return sum(values) / len(values) if values else 0.0

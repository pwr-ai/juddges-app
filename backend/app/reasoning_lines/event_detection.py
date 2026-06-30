"""Event-graph detection helpers for the reasoning-line DAG (#147 split)."""

import uuid
from collections import Counter
from typing import Any

import numpy as np
from loguru import logger

from .similarity import (
    _compute_cosine_similarity,
    _lines_share_legal_bases,
    _pair_centroid_similarity,
)


def _detect_internal_branch(
    members: list[dict[str, Any]],
) -> tuple[bool, float, float]:
    """
    Detect whether a reasoning line shows an internal split (potential branch).

    Splits members into time-ordered first-half and second-half, computes centroid
    embeddings for each half, and checks for divergence.

    Returns (is_branch, centroid_similarity, outcome_divergence).
    """
    if len(members) < 5:
        return False, 1.0, 0.0

    # Sort by decision_date
    sorted_members = sorted(members, key=lambda m: str(m.get("decision_date") or ""))

    mid = len(sorted_members) // 2
    first_half = sorted_members[:mid]
    second_half = sorted_members[mid:]

    # Compute centroid embeddings for each half
    first_embeddings = [
        m["embedding"]
        for m in first_half
        if m.get("embedding")
        and isinstance(m["embedding"], list)
        and len(m["embedding"]) > 0
    ]
    second_embeddings = [
        m["embedding"]
        for m in second_half
        if m.get("embedding")
        and isinstance(m["embedding"], list)
        and len(m["embedding"]) > 0
    ]

    if not first_embeddings or not second_embeddings:
        return False, 1.0, 0.0

    first_centroid = np.mean(np.array(first_embeddings, dtype=np.float32), axis=0)
    second_centroid = np.mean(np.array(second_embeddings, dtype=np.float32), axis=0)

    similarity = _compute_cosine_similarity(first_centroid, second_centroid)

    # Check outcome distribution divergence
    def _outcome_dist(member_list: list[dict[str, Any]]) -> dict[str, float]:
        outcomes = [m.get("outcome_direction") or "unclassified" for m in member_list]
        total = len(outcomes)
        if total == 0:
            return {}
        counter = Counter(outcomes)
        return {k: v / total for k, v in counter.items()}

    first_dist = _outcome_dist(first_half)
    second_dist = _outcome_dist(second_half)

    # Compute outcome divergence as sum of absolute differences across all outcome types
    all_outcomes = set(first_dist.keys()) | set(second_dist.keys())
    outcome_divergence = (
        sum(abs(first_dist.get(k, 0.0) - second_dist.get(k, 0.0)) for k in all_outcomes)
        / 2.0
    )  # Normalize to [0, 1]

    # Branch if centroid similarity is low AND outcomes differ significantly
    is_branch = similarity < 0.85 and outcome_divergence > 0.3

    return is_branch, round(similarity, 4), round(outcome_divergence, 4)


def _find_shared_recent_judgments(
    members_a: list[dict[str, Any]],
    members_b: list[dict[str, Any]],
    recent_years: int = 2,
) -> list[str]:
    """
    Find judgment IDs that appear in both lines' members within the last N years.

    Returns a list of shared judgment IDs sorted by date descending.
    """
    from datetime import date, timedelta

    cutoff = date.today() - timedelta(days=recent_years * 365)
    cutoff_str = cutoff.isoformat()

    def _recent_ids(members: list[dict[str, Any]]) -> set[str]:
        return {
            str(m["judgment_id"])
            for m in members
            if str(m.get("decision_date") or "") >= cutoff_str
        }

    recent_a = _recent_ids(members_a)
    recent_b = _recent_ids(members_b)

    return sorted(recent_a & recent_b)


def _collect_internal_branch_events(
    line_members: dict[str, list[dict[str, Any]]],
    line_by_id: dict[str, dict[str, Any]],
    now: str,
) -> tuple[list[dict[str, Any]], int]:
    """Detect internal branches within each line. Returns (event_rows, branches_detected)."""
    events: list[dict[str, Any]] = []
    branches = 0
    for line_id, members in line_members.items():
        if len(members) < 5:
            continue
        is_branch, sim, outcome_div = _detect_internal_branch(members)
        if not is_branch:
            continue
        events.append(
            {
                "id": str(uuid.uuid4()),
                "event_type": "branch",
                "source_line_id": line_id,
                "target_line_id": None,
                "trigger_judgment_id": None,
                "event_date": None,
                "description": (
                    f"Internal split detected in line '{line_by_id[line_id].get('label', '')}': "
                    f"first/second half centroid similarity={sim}, "
                    f"outcome divergence={outcome_div}"
                ),
                "confidence": round(min((1.0 - sim) + outcome_div, 1.0), 4),
                "drift_score": round(1.0 - sim, 4),
                "metadata": {
                    "detection_type": "internal_split",
                    "centroid_similarity": sim,
                    "outcome_divergence": outcome_div,
                },
                "created_at": now,
            }
        )
        branches += 1
        logger.info(
            f"Internal branch detected in line {line_id}: "
            f"sim={sim}, outcome_div={outcome_div}"
        )
    return events, branches


def _build_cross_branch_event(
    lid_a: str,
    lid_b: str,
    line_a: dict[str, Any],
    line_b: dict[str, Any],
    centroid_sim: float,
    overlap_ratio: float,
    now: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "event_type": "branch",
        "source_line_id": lid_a,
        "target_line_id": lid_b,
        "trigger_judgment_id": None,
        "event_date": None,
        "description": (
            f"Branch detected: lines '{line_a.get('label', '')}' and "
            f"'{line_b.get('label', '')}' share {overlap_ratio:.0%} of legal bases "
            f"but centroid similarity is only {centroid_sim:.3f}"
        ),
        "confidence": round(min((1.0 - centroid_sim) * overlap_ratio * 2, 1.0), 4),
        "drift_score": round(1.0 - centroid_sim, 4),
        "metadata": {
            "detection_type": "cross_line_divergence",
            "centroid_similarity": round(centroid_sim, 4),
            "legal_base_overlap_ratio": round(overlap_ratio, 4),
        },
        "created_at": now,
    }


def _build_merge_event(
    lid_a: str,
    lid_b: str,
    line_a: dict[str, Any],
    line_b: dict[str, Any],
    centroid_sim: float,
    shared_recent: list[str],
    now: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "event_type": "merge",
        "source_line_id": lid_a,
        "target_line_id": lid_b,
        "trigger_judgment_id": shared_recent[0],
        "event_date": None,
        "description": (
            f"Merge detected: lines '{line_a.get('label', '')}' and "
            f"'{line_b.get('label', '')}' have centroid similarity "
            f"{centroid_sim:.3f} and share {len(shared_recent)} recent judgment(s)"
        ),
        "confidence": round(centroid_sim * min(len(shared_recent) / 3.0, 1.0), 4),
        "drift_score": None,
        "metadata": {
            "detection_type": "convergence",
            "centroid_similarity": round(centroid_sim, 4),
            "shared_recent_judgment_ids": shared_recent[:10],
            "shared_recent_count": len(shared_recent),
        },
        "created_at": now,
    }


def _build_influence_event(
    lid_a: str,
    lid_b: str,
    line_a: dict[str, Any],
    line_b: dict[str, Any],
    centroid_sim: float,
    shared_ids: set[str],
    overlap_ratio: float,
    now: str,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "event_type": "influence",
        "source_line_id": lid_a,
        "target_line_id": lid_b,
        "trigger_judgment_id": sorted(shared_ids)[0] if shared_ids else None,
        "event_date": None,
        "description": (
            f"Influence detected: lines '{line_a.get('label', '')}' and "
            f"'{line_b.get('label', '')}' share {len(shared_ids)} judgment(s) "
            f"with moderate centroid similarity {centroid_sim:.3f}"
        ),
        "confidence": round(overlap_ratio * min(len(shared_ids) / 5.0, 1.0), 4),
        "drift_score": None,
        "metadata": {
            "detection_type": "cross_citation",
            "centroid_similarity": round(centroid_sim, 4),
            "shared_judgment_ids": sorted(shared_ids)[:10],
            "shared_judgment_count": len(shared_ids),
        },
        "created_at": now,
    }


def _collect_cross_line_pair_events(
    line_a: dict[str, Any],
    line_b: dict[str, Any],
    lid_a: str,
    lid_b: str,
    members_a: list[dict[str, Any]],
    members_b: list[dict[str, Any]],
    now: str,
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Detect cross-line branch/merge/influence for a single pair.

    Returns (event_rows, branches, merges, influences).
    """
    events: list[dict[str, Any]] = []
    branches = merges = influences = 0

    shares, overlap_ratio = _lines_share_legal_bases(line_a, line_b, min_overlap=1)
    if not shares:
        return events, branches, merges, influences

    centroid_sim = _pair_centroid_similarity(line_a, line_b)
    if centroid_sim is None:
        return events, branches, merges, influences

    # Branch: dissimilar centroids but significant legal-base overlap
    if centroid_sim < 0.7 and overlap_ratio > 0.3:
        events.append(
            _build_cross_branch_event(
                lid_a, lid_b, line_a, line_b, centroid_sim, overlap_ratio, now
            )
        )
        branches += 1
        logger.info(
            f"Cross-line branch: {lid_a} <-> {lid_b}, "
            f"sim={centroid_sim:.3f}, overlap={overlap_ratio:.2f}"
        )

    # Merge: high centroid similarity AND shared recent judgments
    if centroid_sim > 0.85:
        shared_recent = _find_shared_recent_judgments(members_a, members_b)
        if shared_recent:
            events.append(
                _build_merge_event(
                    lid_a, lid_b, line_a, line_b, centroid_sim, shared_recent, now
                )
            )
            merges += 1
            logger.info(
                f"Merge detected: {lid_a} <-> {lid_b}, "
                f"sim={centroid_sim:.3f}, shared_recent={len(shared_recent)}"
            )

    # Influence: shared judgment IDs at moderate similarity
    ids_a = {str(m.get("id") or m.get("judgment_id")) for m in members_a}
    ids_b = {str(m.get("id") or m.get("judgment_id")) for m in members_b}
    shared_ids = ids_a & ids_b
    if 0.5 <= centroid_sim <= 0.85 and shared_ids:
        events.append(
            _build_influence_event(
                lid_a,
                lid_b,
                line_a,
                line_b,
                centroid_sim,
                shared_ids,
                overlap_ratio,
                now,
            )
        )
        influences += 1
        logger.info(
            f"Influence detected: {lid_a} <-> {lid_b}, "
            f"sim={centroid_sim:.3f}, shared={len(shared_ids)}"
        )

    return events, branches, merges, influences

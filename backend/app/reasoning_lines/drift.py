"""Language drift detection endpoint (#147 split)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_RATE_LIMIT,
)
from .schemas import (
    DriftAnalysisResponse,
    DriftPeak,
    DriftWindow,
)
from .similarity import (
    _compute_cosine_similarity,
)
from .timeline_math import (
    _extract_window_keywords,
)

router = APIRouter()


@router.post(
    "/{line_id}/drift-analysis",
    response_model=DriftAnalysisResponse,
    summary="Detect language drift within a reasoning line over time",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def analyze_drift(request: Request, line_id: str) -> DriftAnalysisResponse:
    """
    Detect language drift within a reasoning line by analyzing how the
    embedding centroid shifts across rolling time windows.

    Sorts member judgments chronologically, creates overlapping windows,
    computes centroid drift between consecutive windows, extracts
    entering/exiting keywords, and identifies significant drift peaks.
    Drift events are persisted to the reasoning_line_events table.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line to get its legal_question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id} for drift analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch member judgment IDs from reasoning_line_members
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching members for drift analysis on line {line_id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]

    if len(judgment_ids) < 6:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Drift analysis requires at least 6 members, but reasoning line "
                f"{line_id} has {len(judgment_ids)}. Add more judgments first."
            ),
        )

    # Step 3: Fetch judgments with embeddings, titles, summaries, and decision_dates
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, title, summary, decision_date, embedding")
            .in_("id", judgment_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment embeddings for drift analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment data")

    judgments_raw = j_response.data or []

    # Filter to judgments that have valid embeddings
    judgments_with_embeddings = [
        j
        for j in judgments_raw
        if j.get("embedding")
        and isinstance(j["embedding"], list)
        and len(j["embedding"]) > 0
    ]

    if len(judgments_with_embeddings) < 6:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Drift analysis requires at least 6 members with embeddings, "
                f"but only {len(judgments_with_embeddings)} have valid embeddings."
            ),
        )

    # Step 4: Sort members chronologically by decision_date
    def _date_sort_key(j: dict[str, Any]) -> str:
        date = j.get("decision_date")
        return str(date) if date else ""

    sorted_judgments = sorted(judgments_with_embeddings, key=_date_sort_key)

    total_members = len(sorted_judgments)
    logger.info(
        f"Starting drift analysis for line {line_id} with {total_members} members"
    )

    # Step 5: Determine window size and create rolling windows
    # Window size: min(5, len // 3) but at least 3
    window_size = max(3, min(5, total_members // 3))
    stride = 1

    # Build list of windows (each is a slice of sorted judgments)
    window_slices: list[list[dict[str, Any]]] = []
    for start_idx in range(0, total_members - window_size + 1, stride):
        window_slices.append(sorted_judgments[start_idx : start_idx + window_size])

    if len(window_slices) < 2:
        # Not enough windows to compute drift between consecutive pairs
        raise HTTPException(
            status_code=400,
            detail=(
                f"Not enough data to form at least 2 rolling windows. "
                f"Have {total_members} members with window_size={window_size}."
            ),
        )

    # Step 6: For each window, compute centroid embedding and extract keywords
    window_centroids: list[np.ndarray] = []
    window_keywords_list: list[list[str]] = []

    for window_docs in window_slices:
        # Compute centroid as mean of embeddings in the window
        emb_matrix = np.array(
            [doc["embedding"] for doc in window_docs], dtype=np.float32
        )
        centroid = np.mean(emb_matrix, axis=0)
        window_centroids.append(centroid)

        # Extract top keywords for this window
        keywords = _extract_window_keywords(window_docs, top_n=5)
        window_keywords_list.append(keywords)

    # Step 7: Compute drift scores between consecutive windows
    drift_scores: list[float] = [0.0]  # First window has no predecessor, drift = 0

    for i in range(1, len(window_centroids)):
        similarity = _compute_cosine_similarity(
            window_centroids[i - 1], window_centroids[i]
        )
        # drift_score = 1 - cosine_similarity (higher = more drift)
        drift = round(1.0 - similarity, 6)
        drift_scores.append(drift)

    # Step 8: Compare consecutive keyword sets for entering/exiting keywords
    entering_keywords_per_window: list[list[str]] = [[]]  # first window has none
    exiting_keywords_per_window: list[list[str]] = [[]]  # first window has none

    for i in range(1, len(window_keywords_list)):
        prev_set = set(window_keywords_list[i - 1])
        curr_set = set(window_keywords_list[i])
        entering_keywords_per_window.append(sorted(curr_set - prev_set))
        exiting_keywords_per_window.append(sorted(prev_set - curr_set))

    # Step 9: Build DriftWindow objects
    drift_windows: list[DriftWindow] = []

    for i, window_docs in enumerate(window_slices):
        # Period start/end from the first and last judgment in this window
        first_date = window_docs[0].get("decision_date")
        last_date = window_docs[-1].get("decision_date")

        drift_windows.append(
            DriftWindow(
                window_index=i,
                period_start=str(first_date) if first_date else None,
                period_end=str(last_date) if last_date else None,
                case_count=len(window_docs),
                drift_score=round(drift_scores[i], 4),
                top_keywords=window_keywords_list[i],
                entering_keywords=entering_keywords_per_window[i],
                exiting_keywords=exiting_keywords_per_window[i],
            )
        )

    # Step 10: Identify drift peaks (drift_score > mean + 1.5 * std)
    # Only consider windows with index > 0 (they have meaningful drift scores)
    meaningful_scores = np.array(drift_scores[1:], dtype=np.float64)
    peaks: list[DriftPeak] = []

    if len(meaningful_scores) > 0:
        mean_drift = float(np.mean(meaningful_scores))
        std_drift = float(np.std(meaningful_scores))
        threshold = mean_drift + 1.5 * std_drift

        for i in range(1, len(drift_scores)):
            if drift_scores[i] > threshold:
                window = drift_windows[i]
                peaks.append(
                    DriftPeak(
                        window_index=i,
                        drift_score=window.drift_score,
                        period_start=window.period_start,
                        period_end=window.period_end,
                        entering_keywords=window.entering_keywords,
                        exiting_keywords=window.exiting_keywords,
                    )
                )

    # Step 11: Write drift events to reasoning_line_events for each peak
    drift_events_created = 0

    if peaks:
        event_rows: list[dict[str, Any]] = []
        now = datetime.now(UTC).isoformat()

        for peak in peaks:
            entering_str = (
                ", ".join(peak.entering_keywords) if peak.entering_keywords else "none"
            )
            exiting_str = (
                ", ".join(peak.exiting_keywords) if peak.exiting_keywords else "none"
            )

            event_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "event_type": "drift",
                    "source_line_id": line_id,
                    "event_date": peak.period_end,
                    "drift_score": peak.drift_score,
                    "description": (
                        f"Language drift detected: entering [{entering_str}], "
                        f"exiting [{exiting_str}]"
                    ),
                    "confidence": round(min(peak.drift_score * 2, 1.0), 4),
                    "metadata": {
                        "entering_keywords": peak.entering_keywords,
                        "exiting_keywords": peak.exiting_keywords,
                        "window_index": peak.window_index,
                    },
                    "created_at": now,
                }
            )

        try:
            db.client.table("reasoning_line_events").insert(event_rows).execute()
            drift_events_created = len(event_rows)
            logger.info(
                f"Created {drift_events_created} drift events for line {line_id}"
            )
        except Exception as e:
            logger.error(
                f"Error writing drift events for line {line_id}: {e}. "
                f"Analysis results are still returned."
            )
            # Non-fatal: return the analysis even if event persistence fails

    # Step 12: Compute summary statistics
    all_drift_scores = [w.drift_score for w in drift_windows]
    avg_drift = round(float(np.mean(all_drift_scores)), 4) if all_drift_scores else 0.0
    max_drift = round(float(np.max(all_drift_scores)), 4) if all_drift_scores else 0.0

    logger.info(
        f"Drift analysis complete for line {line_id}: "
        f"{len(drift_windows)} windows, {len(peaks)} peaks, "
        f"avg_drift={avg_drift}, max_drift={max_drift}"
    )

    return DriftAnalysisResponse(
        line_id=line_id,
        legal_question=legal_question,
        windows=drift_windows,
        peaks=peaks,
        avg_drift=avg_drift,
        max_drift=max_drift,
        drift_events_created=drift_events_created,
        total_members_analyzed=total_members,
    )

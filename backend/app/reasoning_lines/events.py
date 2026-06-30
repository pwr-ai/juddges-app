"""Event detection & DAG endpoints (#147 split)."""

import time
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_LLM_RATE_LIMIT,
    REASONING_LINES_READ_RATE_LIMIT,
)
from .event_detection import (
    _collect_cross_line_pair_events,
    _collect_internal_branch_events,
)
from .schemas import (
    DAGEdge,
    DAGNode,
    EventDetectionResult,
    ReasoningLineDAG,
)

router = APIRouter()


@router.post(
    "/detect-events",
    response_model=EventDetectionResult,
    summary="Detect branch/merge/influence events across reasoning lines",
    description=(
        "Scans all active reasoning lines and detects branch and merge events "
        "between them. Expensive computation — limited to 5 requests per hour."
    ),
)
@limiter.limit(REASONING_LINES_LLM_RATE_LIMIT)
async def detect_events(request: Request) -> EventDetectionResult:
    """
    Milestone 4 — Branch & Merge Detection.

    Scans active reasoning lines, detects internal branch signals,
    cross-line branch/merge/influence events, and persists them as
    reasoning_line_events rows.
    """
    start_time = time.time()

    db = get_vector_db()
    branches_detected = 0
    merges_detected = 0
    influences_detected = 0

    # Step 1: Fetch all active reasoning lines (cap at 50 to prevent timeouts)
    MAX_LINES = 50
    try:
        lines_response = (
            db.client.table("reasoning_lines")
            .select(
                "id, label, legal_question, keywords, legal_bases, status, case_count, "
                "coherence_score, avg_embedding, date_range_start, date_range_end"
            )
            .in_("status", ["active", "merged"])
            .limit(MAX_LINES)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning lines for event detection: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    lines = lines_response.data or []
    if len(lines) < 2:
        elapsed = round((time.time() - start_time) * 1000, 1)
        return EventDetectionResult(
            branches_detected=0,
            merges_detected=0,
            influences_detected=0,
            lines_analyzed=len(lines),
            processing_time_ms=elapsed,
        )

    logger.info(f"Event detection: analyzing {len(lines)} reasoning lines")

    # Step 2: Fetch members for each line (with embeddings and outcome_direction)
    line_members: dict[str, list[dict[str, Any]]] = {}
    line_by_id: dict[str, dict[str, Any]] = {}

    for line in lines:
        line_id = str(line["id"])
        line_by_id[line_id] = line

        try:
            members_resp = (
                db.client.table("reasoning_line_members")
                .select("judgment_id, outcome_direction")
                .eq("reasoning_line_id", line_id)
                .execute()
            )
            member_rows = members_resp.data or []
            judgment_ids = [str(m["judgment_id"]) for m in member_rows]

            if not judgment_ids:
                line_members[line_id] = []
                continue

            # Fetch judgment details with embeddings and dates
            j_resp = (
                db.client.table("judgments")
                .select("id, decision_date, embedding")
                .in_("id", judgment_ids)
                .execute()
            )
            judgment_map = {str(j["id"]): j for j in (j_resp.data or [])}

            # Merge member outcome_direction with judgment data
            enriched = []
            for m in member_rows:
                jid = str(m["judgment_id"])
                if jid in judgment_map:
                    merged = {
                        **judgment_map[jid],
                        "outcome_direction": m.get("outcome_direction"),
                    }
                    enriched.append(merged)

            line_members[line_id] = enriched

        except Exception as e:
            logger.warning(f"Error fetching members for line {line_id}: {e}")
            line_members[line_id] = []

    # Step 3: Internal branch detection (within each line)
    now = datetime.now(UTC).isoformat()
    event_rows: list[dict[str, Any]] = []

    internal_events, internal_branches = _collect_internal_branch_events(
        line_members, line_by_id, now
    )
    event_rows.extend(internal_events)
    branches_detected += internal_branches

    # Step 4: Cross-line detection (branch, merge, influence)
    line_ids = list(line_by_id.keys())

    for i in range(len(line_ids)):
        for j in range(i + 1, len(line_ids)):
            lid_a = line_ids[i]
            lid_b = line_ids[j]
            pair_events, b_count, m_count, inf_count = _collect_cross_line_pair_events(
                line_by_id[lid_a],
                line_by_id[lid_b],
                lid_a,
                lid_b,
                line_members.get(lid_a, []),
                line_members.get(lid_b, []),
                now,
            )
            event_rows.extend(pair_events)
            branches_detected += b_count
            merges_detected += m_count
            influences_detected += inf_count

    # Step 5: Persist all detected events to reasoning_line_events
    if event_rows:
        try:
            db.client.table("reasoning_line_events").insert(event_rows).execute()
            logger.info(
                f"Persisted {len(event_rows)} events: "
                f"{branches_detected} branches, {merges_detected} merges, "
                f"{influences_detected} influences"
            )
        except Exception as e:
            logger.error(
                f"Error persisting detected events: {e}. "
                f"Detection counts are still returned."
            )

    elapsed = round((time.time() - start_time) * 1000, 1)
    logger.info(f"Event detection completed in {elapsed}ms")

    return EventDetectionResult(
        branches_detected=branches_detected,
        merges_detected=merges_detected,
        influences_detected=influences_detected,
        lines_analyzed=len(lines),
        processing_time_ms=elapsed,
    )


@router.get(
    "/dag",
    response_model=ReasoningLineDAG,
    summary="Get full DAG structure for visualization",
    description=(
        "Returns all reasoning lines as nodes and all detected events as edges, "
        "forming a directed acyclic graph for visualization."
    ),
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_dag(request: Request) -> ReasoningLineDAG:
    """
    Milestone 4 — DAG Visualization.

    Fetches all reasoning lines (active + merged) as nodes and all
    reasoning_line_events as edges, returning the full DAG structure.
    """
    db = get_vector_db()

    # Step 1: Fetch all reasoning lines as nodes
    try:
        lines_resp = (
            db.client.table("reasoning_lines")
            .select(
                "id, label, status, case_count, coherence_score, "
                "date_range_start, date_range_end, keywords"
            )
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning lines for DAG: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    nodes: list[DAGNode] = []
    for row in lines_resp.data or []:
        nodes.append(
            DAGNode(
                id=str(row["id"]),
                label=row.get("label", ""),
                status=row.get("status", "active"),
                case_count=row.get("case_count", 0),
                coherence_score=row.get("coherence_score"),
                date_range_start=(
                    str(row["date_range_start"])
                    if row.get("date_range_start")
                    else None
                ),
                date_range_end=(
                    str(row["date_range_end"]) if row.get("date_range_end") else None
                ),
                keywords=row.get("keywords") or [],
            )
        )

    # Step 2: Fetch all reasoning_line_events as edges
    try:
        events_resp = (
            db.client.table("reasoning_line_events")
            .select(
                "id, event_type, source_line_id, target_line_id, "
                "event_date, description, confidence, drift_score"
            )
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line events for DAG: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line events"
        )

    edges: list[DAGEdge] = []
    event_type_counts: dict[str, int] = Counter()

    for row in events_resp.data or []:
        source_id = str(row["source_line_id"]) if row.get("source_line_id") else ""
        target_id = str(row["target_line_id"]) if row.get("target_line_id") else ""

        # Skip edges with no source (should not happen, but be defensive)
        if not source_id:
            continue

        event_type = row.get("event_type", "unknown")
        event_type_counts[event_type] += 1

        edges.append(
            DAGEdge(
                id=str(row["id"]),
                event_type=event_type,
                source_id=source_id,
                target_id=target_id,
                event_date=str(row["event_date"]) if row.get("event_date") else None,
                description=row.get("description"),
                confidence=row.get("confidence"),
                drift_score=row.get("drift_score"),
            )
        )

    # Step 3: Build statistics summary
    statistics: dict[str, Any] = {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "by_event_type": dict(event_type_counts),
        "by_status": dict(Counter(n.status for n in nodes)),
    }

    logger.info(
        f"DAG built: {len(nodes)} nodes, {len(edges)} edges, "
        f"event types: {dict(event_type_counts)}"
    )

    return ReasoningLineDAG(
        nodes=nodes,
        edges=edges,
        statistics=statistics,
    )

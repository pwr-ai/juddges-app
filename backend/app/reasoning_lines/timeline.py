"""Temporal outcome timeline endpoint (#147 split)."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_READ_RATE_LIMIT,
)
from .schemas import (
    ReasoningLineTimeline,
    TimelinePoint,
)
from .timeline_math import (
    _bucket_members_by_period,
    _detect_timeline_trend,
)

router = APIRouter()


@router.get(
    "/{line_id}/timeline",
    response_model=ReasoningLineTimeline,
    summary="Get temporal outcome distribution for a reasoning line",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_reasoning_line_timeline(
    request: Request, line_id: str
) -> ReasoningLineTimeline:
    """
    Return time-bucketed outcome distribution for a reasoning line, suitable
    for timeline visualization.

    Automatically selects the bucketing granularity based on the date range:
    - > 3 years: bucket by year
    - 1-3 years: bucket by quarter
    - < 1 year: bucket by month

    Detects overall trend using linear regression on the 'for' ratio over time.
    Returns 'insufficient_data' trend if fewer than 3 time periods have data.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line for legal_question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id} for timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch all members with outcome_direction
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id, outcome_direction")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching members for timeline on line {line_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []
    if not member_rows:
        return ReasoningLineTimeline(
            line_id=line_id,
            legal_question=legal_question,
            points=[],
            trend="insufficient_data",
            trend_slope=0.0,
            total_classified=0,
            total_unclassified=0,
        )

    # Step 3: Fetch decision_date for each member's judgment
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, decision_date")
            .in_("id", judgment_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment dates for timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment dates")

    dates_by_id: dict[str, str | None] = {
        str(j["id"]): str(j["decision_date"]) if j.get("decision_date") else None
        for j in (j_response.data or [])
    }

    # Step 4: Merge member data with dates for bucketing
    enriched_members: list[dict[str, Any]] = []
    total_classified = 0
    total_unclassified = 0

    for m in member_rows:
        jid = str(m["judgment_id"])
        direction = m.get("outcome_direction")
        if direction:
            total_classified += 1
        else:
            total_unclassified += 1

        enriched_members.append(
            {
                "judgment_id": jid,
                "decision_date": dates_by_id.get(jid),
                "outcome_direction": direction,
            }
        )

    # Step 5: Bucket members into time periods
    periods, members_per_period = _bucket_members_by_period(enriched_members)

    if not periods:
        return ReasoningLineTimeline(
            line_id=line_id,
            legal_question=legal_question,
            points=[],
            trend="insufficient_data",
            trend_slope=0.0,
            total_classified=total_classified,
            total_unclassified=total_unclassified,
        )

    # Step 6: Count outcome directions per period and compute for_ratio
    points: list[TimelinePoint] = []
    for_ratios: list[float] = []

    for period_def, period_members in zip(periods, members_per_period, strict=True):
        total = len(period_members)
        for_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "for"
        )
        against_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "against"
        )
        mixed_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "mixed"
        )
        procedural_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "procedural"
        )
        unclassified_count = sum(
            1 for m in period_members if not m.get("outcome_direction")
        )

        # for_ratio: proportion of classified outcomes that are "for"
        classified_in_period = (
            for_count + against_count + mixed_count + procedural_count
        )
        for_ratio = (
            for_count / classified_in_period if classified_in_period > 0 else 0.0
        )

        points.append(
            TimelinePoint(
                period_label=period_def["period_label"],
                start_date=period_def["start_date"],
                end_date=period_def["end_date"],
                total=total,
                for_count=for_count,
                against_count=against_count,
                mixed_count=mixed_count,
                procedural_count=procedural_count,
                unclassified_count=unclassified_count,
                for_ratio=round(for_ratio, 4),
            )
        )

        # Only include periods with classified data in trend analysis
        if classified_in_period > 0:
            for_ratios.append(for_ratio)

    # Step 7: Detect overall trend from for_ratio time series
    trend, trend_slope = _detect_timeline_trend(for_ratios)

    logger.info(
        f"Timeline for line {line_id}: {len(points)} periods, trend={trend}, "
        f"slope={trend_slope}, classified={total_classified}, "
        f"unclassified={total_unclassified}"
    )

    return ReasoningLineTimeline(
        line_id=line_id,
        legal_question=legal_question,
        points=points,
        trend=trend,
        trend_slope=trend_slope,
        total_classified=total_classified,
        total_unclassified=total_unclassified,
    )

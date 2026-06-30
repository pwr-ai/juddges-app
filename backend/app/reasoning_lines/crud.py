"""CRUD persistence endpoints for reasoning lines (#147 split)."""

import uuid
from datetime import UTC, datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_RATE_LIMIT,
    REASONING_LINES_READ_RATE_LIMIT,
)
from .schemas import (
    CreateReasoningLineRequest,
    ReasoningLineDetail,
    ReasoningLineMember,
    ReasoningLineSummary,
)
from .similarity import (
    _compute_cosine_similarity,
)

router = APIRouter()


@router.post(
    "/create",
    response_model=ReasoningLineDetail,
    summary="Save a discovered cluster as a persistent reasoning line",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def create_reasoning_line(
    request: Request, body: CreateReasoningLineRequest
) -> ReasoningLineDetail:
    """
    Persist a reasoning line with its member judgments.

    Fetches embeddings for each judgment to compute the centroid (avg_embedding)
    and per-member similarity_to_centroid. Members are ordered chronologically
    by decision_date.
    """
    if not body.judgment_ids:
        raise HTTPException(status_code=400, detail="judgment_ids must not be empty")

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_ids: list[str] = []
    for jid in body.judgment_ids:
        if jid not in seen:
            seen.add(jid)
            unique_ids.append(jid)

    db = get_vector_db()

    # Fetch judgment metadata and embeddings for all requested IDs
    try:
        response = (
            db.client.table("judgments")
            .select("id, case_number, title, court_name, decision_date, embedding")
            .in_("id", unique_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgments for reasoning line creation: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch judgments from database"
        )

    judgments_by_id: dict[str, dict[str, Any]] = {
        str(j["id"]): j for j in (response.data or [])
    }

    # Validate that all requested judgments exist
    missing = [jid for jid in unique_ids if jid not in judgments_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Judgments not found: {missing[:10]}",  # cap error detail length
        )

    # Compute centroid from member embeddings
    embeddings_list: list[np.ndarray] = []
    for jid in unique_ids:
        emb = judgments_by_id[jid].get("embedding")
        if emb and isinstance(emb, list) and len(emb) > 0:
            embeddings_list.append(np.array(emb, dtype=np.float32))

    avg_embedding: list[float] | None = None
    centroid: np.ndarray | None = None
    if embeddings_list:
        centroid = np.mean(np.array(embeddings_list), axis=0)
        avg_embedding = centroid.tolist()

    # Sort members chronologically to assign position_in_line
    def _sort_key(jid: str) -> str:
        date = judgments_by_id[jid].get("decision_date")
        # Use empty string for missing dates so they sort first
        return str(date) if date else ""

    sorted_ids = sorted(unique_ids, key=_sort_key)

    # Compute date range from sorted members
    dates = [
        str(judgments_by_id[jid]["decision_date"])
        for jid in sorted_ids
        if judgments_by_id[jid].get("decision_date")
    ]
    date_range_start = dates[0] if dates else None
    date_range_end = dates[-1] if dates else None

    now = datetime.now(UTC).isoformat()
    line_id = str(uuid.uuid4())

    # Insert the reasoning line record
    line_row = {
        "id": line_id,
        "label": body.label,
        "legal_question": body.legal_question,
        "keywords": body.keywords,
        "legal_bases": body.legal_bases,
        "status": "active",
        "case_count": len(sorted_ids),
        "date_range_start": date_range_start,
        "date_range_end": date_range_end,
        "coherence_score": body.coherence_score,
        "created_at": now,
        "updated_at": now,
    }
    # Only include avg_embedding if we have one (pgvector expects list or null)
    if avg_embedding is not None:
        line_row["avg_embedding"] = avg_embedding

    try:
        db.client.table("reasoning_lines").insert(line_row).execute()
    except Exception as e:
        logger.error(f"Error inserting reasoning line: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reasoning line")

    # Build and insert member rows
    members: list[ReasoningLineMember] = []
    member_rows: list[dict[str, Any]] = []

    for position, jid in enumerate(sorted_ids, start=1):
        judgment = judgments_by_id[jid]

        # Compute similarity to centroid for this member
        similarity = 0.0
        if centroid is not None:
            emb = judgment.get("embedding")
            if emb and isinstance(emb, list) and len(emb) > 0:
                similarity = _compute_cosine_similarity(
                    np.array(emb, dtype=np.float32), centroid
                )

        member_rows.append(
            {
                "reasoning_line_id": line_id,
                "judgment_id": jid,
                "position_in_line": position,
                "similarity_to_centroid": round(similarity, 4),
            }
        )

        members.append(
            ReasoningLineMember(
                judgment_id=jid,
                signature=judgment.get("case_number"),
                title=judgment.get("title"),
                court_name=judgment.get("court_name"),
                decision_date=(
                    str(judgment["decision_date"])
                    if judgment.get("decision_date")
                    else None
                ),
                position_in_line=position,
                similarity_to_centroid=round(similarity, 4),
            )
        )

    try:
        db.client.table("reasoning_line_members").insert(member_rows).execute()
    except Exception as e:
        logger.error(f"Error inserting reasoning line members: {e}")
        # Clean up the parent row on failure
        db.client.table("reasoning_lines").delete().eq("id", line_id).execute()
        raise HTTPException(
            status_code=500, detail="Failed to create reasoning line members"
        )

    logger.info(
        f"Created reasoning line {line_id} with {len(members)} members "
        f"(label={body.label!r})"
    )

    return ReasoningLineDetail(
        id=line_id,
        label=body.label,
        legal_question=body.legal_question,
        keywords=body.keywords,
        legal_bases=body.legal_bases,
        status="active",
        case_count=len(members),
        coherence_score=body.coherence_score,
        date_range_start=date_range_start,
        date_range_end=date_range_end,
        created_at=now,
        updated_at=now,
        members=members,
    )


@router.get(
    "/",
    response_model=list[ReasoningLineSummary],
    summary="List saved reasoning lines",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def list_reasoning_lines(
    request: Request,
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, ge=1, le=200, description="Max results to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> list[ReasoningLineSummary]:
    """
    Return a paginated list of saved reasoning lines, ordered by creation date
    (newest first). Optionally filter by status.
    """
    db = get_vector_db()

    select_fields = (
        "id, label, legal_question, keywords, legal_bases, status, "
        "case_count, coherence_score, date_range_start, date_range_end, created_at"
    )

    try:
        query = db.client.table("reasoning_lines").select(select_fields)

        if status:
            valid_statuses = {"active", "merged", "superseded", "dormant"}
            if status not in valid_statuses:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status filter. Must be one of: {', '.join(sorted(valid_statuses))}",
                )
            query = query.eq("status", status)

        response = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing reasoning lines: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reasoning lines")

    rows = response.data or []

    return [
        ReasoningLineSummary(
            id=str(row["id"]),
            label=row["label"],
            legal_question=row["legal_question"],
            keywords=row.get("keywords") or [],
            legal_bases=row.get("legal_bases") or [],
            status=row["status"],
            case_count=row.get("case_count", 0),
            coherence_score=row.get("coherence_score"),
            date_range_start=str(row["date_range_start"])
            if row.get("date_range_start")
            else None,
            date_range_end=str(row["date_range_end"])
            if row.get("date_range_end")
            else None,
            created_at=str(row["created_at"]),
        )
        for row in rows
    ]


@router.get(
    "/{line_id}",
    response_model=ReasoningLineDetail,
    summary="Get full detail of a reasoning line with all members",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_reasoning_line(request: Request, line_id: str) -> ReasoningLineDetail:
    """
    Retrieve a single reasoning line by ID, including all member judgments
    with their metadata joined from the judgments table.
    """
    db = get_vector_db()

    # Fetch the reasoning line
    line_fields = (
        "id, label, legal_question, keywords, legal_bases, status, "
        "case_count, coherence_score, date_range_start, date_range_end, "
        "created_at, updated_at"
    )
    try:
        response = (
            db.client.table("reasoning_lines")
            .select(line_fields)
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    line = rows[0]

    # Fetch members ordered by position_in_line
    member_fields = (
        "judgment_id, position_in_line, similarity_to_centroid, "
        "reasoning_pattern, outcome_direction"
    )
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select(member_fields)
            .eq("reasoning_line_id", line_id)
            .order("position_in_line")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching members for reasoning line {line_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []

    # Fetch judgment metadata for all members in one batch query
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]
    judgments_by_id: dict[str, dict[str, Any]] = {}

    if judgment_ids:
        try:
            j_response = (
                db.client.table("judgments")
                .select("id, case_number, title, court_name, decision_date")
                .in_("id", judgment_ids)
                .execute()
            )
            judgments_by_id = {str(j["id"]): j for j in (j_response.data or [])}
        except Exception as e:
            logger.warning(f"Error fetching judgment details for line {line_id}: {e}")
            # Non-fatal: we still return members with available data

    members: list[ReasoningLineMember] = []
    for m in member_rows:
        jid = str(m["judgment_id"])
        judgment = judgments_by_id.get(jid, {})
        members.append(
            ReasoningLineMember(
                judgment_id=jid,
                signature=judgment.get("case_number"),
                title=judgment.get("title"),
                court_name=judgment.get("court_name"),
                decision_date=(
                    str(judgment["decision_date"])
                    if judgment.get("decision_date")
                    else None
                ),
                position_in_line=m.get("position_in_line", 0),
                similarity_to_centroid=m.get("similarity_to_centroid", 0.0),
                reasoning_pattern=m.get("reasoning_pattern"),
                outcome_direction=m.get("outcome_direction"),
            )
        )

    return ReasoningLineDetail(
        id=str(line["id"]),
        label=line["label"],
        legal_question=line["legal_question"],
        keywords=line.get("keywords") or [],
        legal_bases=line.get("legal_bases") or [],
        status=line["status"],
        case_count=line.get("case_count", 0),
        coherence_score=line.get("coherence_score"),
        date_range_start=str(line["date_range_start"])
        if line.get("date_range_start")
        else None,
        date_range_end=str(line["date_range_end"])
        if line.get("date_range_end")
        else None,
        created_at=str(line["created_at"]),
        updated_at=str(line.get("updated_at") or line["created_at"]),
        members=members,
    )


@router.delete(
    "/{line_id}",
    summary="Soft-delete a reasoning line by setting status to superseded",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def delete_reasoning_line(request: Request, line_id: str) -> dict[str, str]:
    """
    Soft-delete a reasoning line by setting its status to 'superseded'.
    The line and its members remain in the database for historical reference.
    """
    db = get_vector_db()

    # Verify the line exists
    try:
        response = (
            db.client.table("reasoning_lines")
            .select("id, status")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error checking reasoning line {line_id} for deletion: {e}")
        raise HTTPException(status_code=500, detail="Failed to check reasoning line")

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    # Perform soft delete
    now = datetime.now(UTC).isoformat()
    try:
        db.client.table("reasoning_lines").update(
            {"status": "superseded", "updated_at": now}
        ).eq("id", line_id).execute()
    except Exception as e:
        logger.error(f"Error soft-deleting reasoning line {line_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete reasoning line")

    logger.info(f"Soft-deleted reasoning line {line_id} (status -> superseded)")

    return {"status": "deleted", "id": line_id}

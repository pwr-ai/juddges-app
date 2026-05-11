"""Lightweight search analytics: record queries and surface insights.

Also provides eval query export — combining search logs with user feedback
to produce evaluation datasets for search quality measurement.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from loguru import logger

from app.core.supabase import supabase_client


def record_topic_click(
    topic_id: str,
    query: str,
    user_id: str | None = None,
    jurisdiction: str | None = None,
) -> None:
    """Fire-and-forget insert into search_topic_clicks. Never raises."""
    if not supabase_client:
        return
    try:
        supabase_client.table("search_topic_clicks").insert(
            {
                "user_id": user_id,
                "topic_id": topic_id[:500],
                "query": query[:500],
                "jurisdiction": jurisdiction[:100] if jurisdiction else None,
            }
        ).execute()
    except Exception as exc:
        logger.warning(f"Failed to record topic click analytics: {exc}")


def record_search_query(
    query: str,
    hit_count: int,
    processing_ms: int | None = None,
    filters: str | None = None,
    topic_hits_count: int | None = None,
) -> None:
    """Fire-and-forget insert into search_analytics. Never raises."""
    if not supabase_client:
        return
    try:
        supabase_client.table("search_analytics").insert(
            {
                "query": query[:500],  # cap length
                "hit_count": hit_count,
                "processing_ms": processing_ms,
                "filters": filters[:500] if filters else None,
                "topic_hits_count": topic_hits_count,
            }
        ).execute()
    except Exception as exc:
        logger.debug(f"Failed to record search analytics: {exc}")


async def get_popular_queries(days: int = 7, limit: int = 20) -> list[dict[str, Any]]:
    """Return the most frequent queries in the last N days."""
    if not supabase_client:
        return []
    try:
        result = supabase_client.rpc(
            "get_popular_search_queries",
            {"days_back": days, "max_results": limit},
        ).execute()
        return result.data or []
    except Exception as exc:
        logger.warning(f"Failed to fetch popular queries: {exc}")
        return []


async def get_zero_result_queries(
    days: int = 7, limit: int = 20
) -> list[dict[str, Any]]:
    """Return queries that returned zero results in the last N days."""
    if not supabase_client:
        return []
    try:
        result = supabase_client.rpc(
            "get_zero_result_queries",
            {"days_back": days, "max_results": limit},
        ).execute()
        return result.data or []
    except Exception as exc:
        logger.warning(f"Failed to fetch zero-result queries: {exc}")
        return []


# ── Eval query export ────────────────────────────────────────────────────


async def export_eval_queries(
    days: int = 30,
    min_frequency: int = 1,
    limit: int = 500,
    include_feedback: bool = True,
) -> dict[str, Any]:
    """Export deduplicated search queries as an evaluation dataset.

    Combines two data sources:
    1. **search_analytics** — raw query logs (unlabeled, shows real usage)
    2. **search_feedback** — user-rated query-document pairs (labeled ground truth)

    Returns a JSON-serialisable dict with:
    - ``queries``: list of eval query objects
    - ``metadata``: export parameters and statistics
    """
    if not supabase_client:
        return {"queries": [], "metadata": {"error": "supabase_client not configured"}}

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()

    # 1. Fetch deduplicated queries from search_analytics
    log_queries = await _fetch_log_queries(cutoff, min_frequency, limit)

    # 2. Optionally enrich with feedback labels
    feedback_map: dict[str, list[dict[str, Any]]] = {}
    if include_feedback:
        feedback_map = await _fetch_feedback_labels(cutoff)

    # 3. Merge into eval dataset
    eval_queries: list[dict[str, Any]] = []
    seen_queries: set[str] = set()

    for row in log_queries:
        query_text = row["query"]
        normalised = query_text.strip().lower()
        if normalised in seen_queries:
            continue
        seen_queries.add(normalised)

        entry: dict[str, Any] = {
            "query": query_text,
            "query_source": "user_logs",
            "frequency": row.get("search_count", 1),
            "avg_hit_count": row.get("avg_hits"),
            "avg_processing_ms": row.get("avg_processing_ms"),
        }
        if normalised in feedback_map:
            entry["relevance_labels"] = feedback_map[normalised]
            entry["has_ground_truth"] = True
        else:
            entry["relevance_labels"] = []
            entry["has_ground_truth"] = False
        eval_queries.append(entry)

    # 4. Add feedback-only queries not yet captured from analytics
    for normalised_q, labels in feedback_map.items():
        if normalised_q not in seen_queries:
            seen_queries.add(normalised_q)
            eval_queries.append(
                {
                    "query": labels[0]["search_query"],
                    "query_source": "feedback_rated",
                    "frequency": 0,
                    "avg_hit_count": None,
                    "avg_processing_ms": None,
                    "relevance_labels": labels,
                    "has_ground_truth": True,
                }
            )

    labeled_count = sum(1 for q in eval_queries if q["has_ground_truth"])

    return {
        "queries": eval_queries,
        "metadata": {
            "exported_at": datetime.now(UTC).isoformat(),
            "days": days,
            "min_frequency": min_frequency,
            "total_queries": len(eval_queries),
            "labeled_queries": labeled_count,
            "unlabeled_queries": len(eval_queries) - labeled_count,
            "source_breakdown": {
                "user_logs": sum(
                    1 for q in eval_queries if q["query_source"] == "user_logs"
                ),
                "feedback_rated": sum(
                    1 for q in eval_queries if q["query_source"] == "feedback_rated"
                ),
            },
        },
    }


async def _fetch_log_queries(
    cutoff_iso: str, min_frequency: int, limit: int
) -> list[dict[str, Any]]:
    """Fetch deduplicated queries from search_analytics via RPC or direct query."""
    assert supabase_client is not None
    try:
        # Try the RPC first (reuse existing popular-queries RPC with wider window)
        result = supabase_client.rpc(
            "get_popular_search_queries",
            {"days_back": 9999, "max_results": limit},
        ).execute()
        rows = result.data or []

        # Client-side filter for min_frequency and cutoff
        # (the RPC returns all popular queries, we filter further here)
        return [r for r in rows if r.get("search_count", 0) >= min_frequency][:limit]
    except Exception as exc:
        logger.warning(f"RPC fetch failed, falling back to direct query: {exc}")

    # Fallback: direct table query (less efficient but works without RPC)
    try:
        result = (
            supabase_client.table("search_analytics")
            .select("query, hit_count, processing_ms")
            .gte("created_at", cutoff_iso)
            .order("created_at", desc=True)
            .limit(limit * 5)  # over-fetch for dedup
            .execute()
        )
        rows = result.data or []

        # Group and deduplicate
        from collections import Counter, defaultdict

        counts: Counter[str] = Counter()
        hits: defaultdict[str, list[int]] = defaultdict(list)
        ms: defaultdict[str, list[int]] = defaultdict(list)
        original: dict[str, str] = {}

        for r in rows:
            q = r["query"].strip().lower()
            counts[q] += 1
            if q not in original:
                original[q] = r["query"]
            if r.get("hit_count") is not None:
                hits[q].append(r["hit_count"])
            if r.get("processing_ms") is not None:
                ms[q].append(r["processing_ms"])

        deduped = []
        for q, cnt in counts.most_common(limit):
            if cnt < min_frequency:
                continue
            deduped.append(
                {
                    "query": original[q],
                    "search_count": cnt,
                    "avg_hits": round(sum(hits[q]) / len(hits[q]), 1)
                    if hits[q]
                    else None,
                    "avg_processing_ms": (
                        round(sum(ms[q]) / len(ms[q]), 1) if ms[q] else None
                    ),
                }
            )
        return deduped
    except Exception as exc:
        logger.warning(f"Failed to export log queries: {exc}")
        return []


async def _fetch_feedback_labels(cutoff_iso: str) -> dict[str, list[dict[str, Any]]]:
    """Fetch user-rated query-document pairs from search_feedback.

    Returns a dict keyed by normalised query text, each value is a list
    of rating records.
    """
    assert supabase_client is not None
    try:
        result = (
            supabase_client.table("search_feedback")
            .select("search_query, document_id, rating, result_position, reason")
            .gte("created_at", cutoff_iso)
            .order("created_at", desc=True)
            .limit(2000)
            .execute()
        )
        rows = result.data or []

        feedback_map: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            key = r["search_query"].strip().lower()
            entry = {
                "search_query": r["search_query"],
                "document_id": r["document_id"],
                "rating": r["rating"],
                "result_position": r.get("result_position"),
                "reason": r.get("reason"),
            }
            feedback_map.setdefault(key, []).append(entry)

        return feedback_map
    except Exception as exc:
        logger.warning(f"Failed to fetch feedback labels: {exc}")
        return {}

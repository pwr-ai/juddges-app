"""Lightweight search analytics: record queries and surface insights."""

from __future__ import annotations

from typing import Any

from loguru import logger

from app.core.supabase import supabase_client


def record_search_query(
    query: str,
    hit_count: int,
    processing_ms: int | None = None,
    filters: str | None = None,
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

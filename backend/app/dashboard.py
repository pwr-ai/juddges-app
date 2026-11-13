"""Dashboard endpoints for home page statistics and data-availability health."""

import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel
from supabase import Client, PostgrestAPIError, StorageException, create_client
from supabase.client import ClientOptions

from app.auth import verify_api_key
from app.rate_limiter import limiter

# Redis client setup (optional, falls back to in-memory cache)
try:
    import redis.asyncio as redis

    redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_AUTH"),
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    REDIS_AVAILABLE = True
    logger.info("Redis client initialized for dashboard caching")
except Exception as e:
    # Broad catch: covers ImportError (redis not installed), ValueError (bad port),
    # and redis.exceptions.ConnectionError at import time.
    logger.warning(f"Redis not available, using in-memory cache: {e}")
    redis_client = None
    REDIS_AVAILABLE = False


router = APIRouter(prefix="/dashboard", tags=["dashboard"])

DASHBOARD_READ_RATE_LIMIT = os.getenv("DASHBOARD_READ_RATE_LIMIT", "100/minute")
DASHBOARD_HEALTH_RATE_LIMIT = os.getenv("DASHBOARD_HEALTH_RATE_LIMIT", "30/minute")


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} environment variable is required")
    return value


# Initialize Supabase client
@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Get cached Supabase client instance."""
    # Use ClientOptions to configure timeout instead of deprecated timeout parameter
    options = ClientOptions(
        postgrest_client_timeout=30, storage_client_timeout=30, schema="public"
    )
    return create_client(
        _get_required_env("SUPABASE_URL"),
        _get_required_env("SUPABASE_SERVICE_ROLE_KEY"),
        options=options,
    )


supabase: Client = get_supabase_client()

# Cache for dashboard stats with TTL. The version is part of both the Redis key
# and payload so deployments never deserialize a cache produced for an older
# response contract.
DASHBOARD_STATS_CACHE_VERSION = 2
DASHBOARD_STATS_CACHE_KEY = f"dashboard:stats:v{DASHBOARD_STATS_CACHE_VERSION}"
LEGACY_DASHBOARD_STATS_CACHE_KEY = "dashboard:stats"
_stats_cache = {"data": None, "timestamp": None, "version": None}
_cache_ttl = 14400  # 4 hours


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class JurisdictionCounts(BaseModel):
    PL: int = 0
    UK: int = 0


class DistributionItem(BaseModel):
    name: str
    count: int
    jurisdiction: str | None = None


class YearlyDecisionCount(BaseModel):
    year: int
    count: int


class JurisdictionYearlyDecisionCount(YearlyDecisionCount):
    jurisdiction: Literal["PL", "UK"]


class DataCompleteness(BaseModel):
    embeddings_pct: float = 0.0
    structure_extraction_pct: float = 0.0
    deep_analysis_pct: float = 0.0
    with_summary_pct: float = 0.0
    with_keywords_pct: float = 0.0
    with_legal_topics_pct: float = 0.0
    with_cited_legislation_pct: float = 0.0
    avg_text_length_chars: float = 0.0


class DashboardStats(BaseModel):
    total_judgments: int = 0
    jurisdictions: JurisdictionCounts = JurisdictionCounts()
    court_levels: list[DistributionItem] = []
    top_courts: list[DistributionItem] = []
    decisions_per_year: list[YearlyDecisionCount] | None = None
    decisions_per_year_by_jurisdiction: list[JurisdictionYearlyDecisionCount]
    date_range: dict[str, str | None] | None = None
    case_types: list[DistributionItem] = []
    decision_types: list[DistributionItem] = []
    data_completeness: DataCompleteness = DataCompleteness()
    # Retained for UI back-compat (stats-card-v1.tsx); always None until
    # legal-domain extraction coverage improves.
    top_legal_domains: list[DistributionItem] | None = None
    top_keywords: list[DistributionItem] = []
    computed_at: str | None = None


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


async def _get_cached_dashboard_stats(
    cache_key: str, now: datetime
) -> DashboardStats | None:
    """Get dashboard stats from Redis first, then in-memory cache."""
    if REDIS_AVAILABLE and redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                payload = json.loads(cached_data)
                if (
                    not isinstance(payload, dict)
                    or payload.get("version") != DASHBOARD_STATS_CACHE_VERSION
                    or not isinstance(payload.get("data"), dict)
                ):
                    raise ValueError("Unsupported dashboard cache payload version")
                logger.debug("Returning Redis cached dashboard stats")
                return DashboardStats.model_validate(payload["data"])
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Redis cache read failed (bad data): {e}")
        except Exception as e:
            # Broad catch: redis.exceptions.RedisError and connection errors
            # can't be imported at module level without redis being installed.
            logger.warning(f"Redis cache read failed: {e}")

    if (
        _stats_cache["data"] is not None
        and _stats_cache["timestamp"] is not None
        and _stats_cache["version"] == DASHBOARD_STATS_CACHE_VERSION
        and (now - _stats_cache["timestamp"]).total_seconds() < _cache_ttl
    ):
        logger.debug("Returning in-memory cached dashboard stats")
        return _stats_cache["data"]

    return None


async def _update_dashboard_cache(
    cache_key: str, stats: DashboardStats, now: datetime
) -> None:
    """Persist stats to Redis and in-memory fallback cache."""
    if REDIS_AVAILABLE and redis_client:
        try:
            await redis_client.setex(
                cache_key,
                _cache_ttl,
                json.dumps(
                    {
                        "version": DASHBOARD_STATS_CACHE_VERSION,
                        "data": stats.model_dump(),
                    }
                ),
            )
            logger.debug("Updated Redis dashboard stats cache")
        except Exception as e:
            # Broad catch: redis.exceptions.RedisError and connection errors
            # can't be imported at module level without redis being installed.
            logger.warning(f"Redis cache write failed: {e}")

    _stats_cache["data"] = stats
    _stats_cache["timestamp"] = now
    _stats_cache["version"] = DASHBOARD_STATS_CACHE_VERSION
    logger.debug("Updated in-memory dashboard stats cache")


def _clear_stats_cache() -> None:
    """Clear the in-memory stats cache."""
    _stats_cache["data"] = None
    _stats_cache["timestamp"] = None
    _stats_cache["version"] = None
    logger.info("Cleared in-memory dashboard stats cache")


# ---------------------------------------------------------------------------
# Fallback stats computation
# ---------------------------------------------------------------------------


async def _compute_fallback_stats() -> DashboardStats:
    """Compute basic stats directly from judgments table as fallback."""
    try:
        # Simple count query
        total = supabase.table("judgments").select("id", count="exact").execute()
        pl = (
            supabase.table("judgments")
            .select("id", count="exact")
            .eq("jurisdiction", "PL")
            .execute()
        )
        uk = (
            supabase.table("judgments")
            .select("id", count="exact")
            .eq("jurisdiction", "UK")
            .execute()
        )

        return DashboardStats(
            total_judgments=total.count or 0,
            jurisdictions=JurisdictionCounts(PL=pl.count or 0, UK=uk.count or 0),
            decisions_per_year_by_jurisdiction=[],
        )
    except (PostgrestAPIError, StorageException) as e:
        logger.opt(exception=True).error("Fallback stats computation failed: {}", e)
        raise HTTPException(
            status_code=503,
            detail="Dashboard statistics are unavailable",
        ) from e


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStats)
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def get_dashboard_stats(
    request: Request,
    response: Response,
    api_key: str = Depends(verify_api_key),
):
    """Get precomputed dashboard statistics."""
    cache_key = DASHBOARD_STATS_CACHE_KEY
    now = datetime.now(UTC)
    cached_stats = await _get_cached_dashboard_stats(cache_key, now)
    if cached_stats:
        return cached_stats

    try:
        stats_response = (
            supabase.table("dashboard_precomputed_stats")
            .select("stat_key, stat_value, computed_at")
            .execute()
        )

        if not stats_response.data:
            # Fallback: try to compute basic stats directly from judgments
            return await _compute_fallback_stats()

        # Build stats from precomputed values
        stats_map = {row["stat_key"]: row["stat_value"] for row in stats_response.data}
        # Get computed_at from the first row's column value
        row_computed_at = (
            stats_response.data[0].get("computed_at") if stats_response.data else None
        )

        stats = DashboardStats(
            total_judgments=stats_map.get("total_judgments", 0),
            jurisdictions=JurisdictionCounts(
                **stats_map.get("judgments_by_jurisdiction", {"PL": 0, "UK": 0})
            ),
            court_levels=[
                DistributionItem(
                    name=x.get("level", ""),
                    count=x.get("count", 0),
                    jurisdiction=x.get("jurisdiction"),
                )
                for x in stats_map.get("court_level_distribution", [])
            ],
            top_courts=[
                DistributionItem(
                    name=x.get("name", ""),
                    count=x.get("count", 0),
                    jurisdiction=x.get("jurisdiction"),
                )
                for x in stats_map.get("top_courts", [])
            ],
            decisions_per_year=stats_map.get("decisions_per_year"),
            decisions_per_year_by_jurisdiction=stats_map.get(
                "decisions_per_year_by_jurisdiction", []
            ),
            date_range=stats_map.get("date_range"),
            case_types=[
                DistributionItem(
                    name=x.get("type", ""),
                    count=x.get("count", 0),
                )
                for x in stats_map.get("case_type_distribution", [])
            ],
            decision_types=[
                DistributionItem(
                    name=x.get("type", ""),
                    count=x.get("count", 0),
                )
                for x in stats_map.get("decision_type_distribution", [])
            ],
            data_completeness=DataCompleteness(
                **stats_map.get("data_completeness", {})
            ),
            top_keywords=[
                DistributionItem(
                    name=x.get("name", ""),
                    count=x.get("count", 0),
                )
                for x in stats_map.get("top_keywords", [])
            ],
            computed_at=row_computed_at,
        )

        await _update_dashboard_cache(cache_key, stats, now)
        return stats

    except (PostgrestAPIError, StorageException, KeyError, ValueError) as e:
        logger.opt(exception=True).error("Error fetching precomputed stats: {}", e)
        return await _compute_fallback_stats()


@router.get("/health")
@limiter.limit(DASHBOARD_HEALTH_RATE_LIMIT)
async def dashboard_health(
    request: Request,
    api_key: str = Depends(verify_api_key),
):
    """Check dashboard data availability."""
    try:
        stats = (
            supabase.table("dashboard_precomputed_stats")
            .select("stat_key, computed_at")
            .limit(1)
            .execute()
        )
        judgments = supabase.table("judgments").select("id", count="exact").execute()

        has_precomputed = len(stats.data) > 0
        computed_at = stats.data[0]["computed_at"] if has_precomputed else None

        return {
            "status": "healthy" if has_precomputed else "degraded",
            "total_judgments_in_db": judgments.count or 0,
            "precomputed_stats_available": has_precomputed,
            "stats_computed_at": computed_at,
            "backend_version": "1.0.0",
        }
    except (PostgrestAPIError, StorageException) as e:
        return {
            "status": "unhealthy",
            "error": str(e),
        }

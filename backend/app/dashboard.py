"""Dashboard endpoints for home page statistics and recent documents."""

import json
import os
import re
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
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
DASHBOARD_REFRESH_RATE_LIMIT = os.getenv("DASHBOARD_REFRESH_RATE_LIMIT", "20/minute")


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

# Cache for dashboard stats with TTL
_stats_cache = {"data": None, "timestamp": None}
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
    decisions_per_year: list[dict] | None = None
    date_range: dict[str, str | None] | None = None
    case_types: list[DistributionItem] = []
    data_completeness: DataCompleteness = DataCompleteness()
    # Retained for UI back-compat (stats-card-v1.tsx); always None until
    # legal-domain extraction coverage improves.
    top_legal_domains: list[DistributionItem] | None = None
    top_keywords: list[DistributionItem] = []
    computed_at: str | None = None


class DocumentSummary(BaseModel):
    """Document with AI-generated summary."""

    id: str
    title: str
    document_type: str
    publication_date: str | None
    ai_summary: str | None
    key_topics: list[str] | None
    jurisdiction: str | None
    language: str
    issuing_body: dict | None
    document_number: str | None = None
    document_id: str | None = None


class TrendingTopic(BaseModel):
    """Trending topic information."""

    topic: str
    change: str
    trend: str  # "up", "down", "stable"
    query_count: int
    category: str


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
                logger.debug("Returning Redis cached dashboard stats")
                return DashboardStats(**json.loads(cached_data))
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(f"Redis cache read failed (bad data): {e}")
        except Exception as e:
            # Broad catch: redis.exceptions.RedisError and connection errors
            # can't be imported at module level without redis being installed.
            logger.warning(f"Redis cache read failed: {e}")

    if (
        _stats_cache["data"] is not None
        and _stats_cache["timestamp"] is not None
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
                cache_key, _cache_ttl, json.dumps(stats.model_dump())
            )
            logger.debug("Updated Redis dashboard stats cache")
        except Exception as e:
            # Broad catch: redis.exceptions.RedisError and connection errors
            # can't be imported at module level without redis being installed.
            logger.warning(f"Redis cache write failed: {e}")

    _stats_cache["data"] = stats
    _stats_cache["timestamp"] = now
    logger.debug("Updated in-memory dashboard stats cache")


def _clear_stats_cache() -> None:
    """Clear the in-memory stats cache."""
    _stats_cache["data"] = None
    _stats_cache["timestamp"] = None
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
        )
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Fallback stats computation failed: {e}", exc_info=True)
        return DashboardStats()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStats)
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def get_dashboard_stats(request: Request, api_key: str = Depends(verify_api_key)):
    """Get precomputed dashboard statistics."""
    cache_key = "dashboard:stats"
    now = datetime.now(UTC)
    cached_stats = await _get_cached_dashboard_stats(cache_key, now)
    if cached_stats:
        return cached_stats

    try:
        response = (
            supabase.table("dashboard_precomputed_stats")
            .select("stat_key, stat_value, computed_at")
            .execute()
        )

        if not response.data:
            # Fallback: try to compute basic stats directly from judgments
            return await _compute_fallback_stats()

        # Build stats from precomputed values
        stats_map = {row["stat_key"]: row["stat_value"] for row in response.data}
        # Get computed_at from the first row's column value
        row_computed_at = response.data[0].get("computed_at") if response.data else None

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
            date_range=stats_map.get("date_range"),
            case_types=[
                DistributionItem(
                    name=x.get("type", ""),
                    count=x.get("count", 0),
                )
                for x in stats_map.get("case_type_distribution", [])
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
        logger.error(f"Error fetching precomputed stats: {e}", exc_info=True)
        return await _compute_fallback_stats()


@router.post("/refresh-stats")
@limiter.limit(DASHBOARD_REFRESH_RATE_LIMIT)
async def refresh_dashboard_stats(
    request: Request, api_key: str = Depends(verify_api_key)
):
    """
    Trigger a refresh of precomputed dashboard statistics.

    Calls the SQL function to recompute stats and clears all caches so that
    the next /stats request returns fresh data.

    Returns:
        dict: Status message
    """
    logger.info("Manual dashboard stats refresh triggered")

    try:
        # Call the SQL function to recompute stats
        supabase.rpc("refresh_dashboard_stats").execute()
        logger.info("refresh_dashboard_stats RPC call succeeded")
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error refreshing stats via RPC: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Clear caches regardless of RPC outcome so stale data is not served
    if REDIS_AVAILABLE and redis_client:
        try:
            await redis_client.delete("dashboard:stats")
            logger.info("Cleared Redis cache")
        except Exception as e:
            # Broad catch: redis.exceptions.RedisError and connection errors
            # can't be imported at module level without redis being installed.
            logger.warning(f"Could not clear Redis cache: {e}")

    _clear_stats_cache()

    return {"status": "ok", "message": "Stats refreshed"}


@router.get("/health")
async def dashboard_health():
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


@router.get("/recent-documents", response_model=list[DocumentSummary])
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def get_recent_documents(
    request: Request,
    limit: int = Query(default=5, ge=1, le=20),
    api_key: str = Depends(verify_api_key),
):
    """
    Get highlighted documents for dashboard.

    Returns a curated selection of documents:
    - 2 IP Box documents (from full-text search for "ipbox")
    - 2 Frank documents (from full-text search for "sprawa frankowa")

    Args:
        limit: Number of documents to return (1-20) - currently returns 4 highlighted documents

    Returns:
        List of highlighted documents with metadata
    """
    import random

    documents = []

    async def search_and_convert(
        query: str, num_docs: int = 2
    ) -> list[DocumentSummary]:
        """Search for documents and convert to DocumentSummary."""
        results = []
        try:
            supabase = get_supabase_client()
            # Use full-text search on legal_documents table
            response = (
                supabase.table("legal_documents")
                .select(
                    "document_id, title, document_type, date_issued, country, language, document_number, issuing_body"
                )
                .text_search("full_text", query, config="simple")
                .eq("language", "pl")
                .limit(20)
                .execute()
            )

            if response.data:
                # Select random documents from results
                num_to_select = min(num_docs, len(response.data))
                selected = random.sample(response.data, num_to_select)

                for doc in selected:
                    try:
                        doc_summary = DocumentSummary(
                            id=doc.get("document_id", ""),
                            title=doc.get("title")
                            or f"Document {doc.get('document_id', '')[:8]}",
                            document_type=doc.get("document_type") or "unknown",
                            publication_date=doc.get("date_issued"),
                            ai_summary=None,
                            key_topics=None,
                            jurisdiction=doc.get("country"),
                            language=doc.get("language") or "pl",
                            issuing_body=doc.get("issuing_body"),
                            document_number=doc.get("document_number"),
                            document_id=doc.get("document_id", ""),
                        )
                        results.append(doc_summary)
                        logger.info(
                            f"Found document for '{query}': {doc_summary.title[:50] if doc_summary.title else 'Untitled'}"
                        )
                    except (ValueError, KeyError, TypeError) as e:
                        logger.warning(f"Error converting document: {e}")
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Error searching for '{query}': {e}")

        return results

    try:
        # 1. Get 2 IP Box documents
        ipbox_docs = await search_and_convert("ipbox", 2)
        documents.extend(ipbox_docs)

        # 2. Get 2 Frank documents
        frank_docs = await search_and_convert("sprawa frankowa", 2)
        documents.extend(frank_docs)

        # Remove duplicates based on document ID
        seen_ids = set()
        unique_documents = []
        for doc in documents:
            if doc and doc.id not in seen_ids:
                seen_ids.add(doc.id)
                unique_documents.append(doc)

        logger.info(
            f"Returning {len(unique_documents)} highlighted documents (IP Box + Frank cases)"
        )
        return unique_documents

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching highlighted documents: {e}", exc_info=True)
        return []


_PL_DOCKET_PATTERN = re.compile(
    r"Sygn\.?\s*akt[:\s]+([IVX]+\s+[A-Z]+\s+\d+/\d+)", re.IGNORECASE
)
_UK_CASE_PATTERN = re.compile(r"Case No[:\s]+(\d{4}/\d+[A-Z]*\d*)", re.IGNORECASE)
_NEUTRAL_CITATION_PATTERN = re.compile(
    r"\[(\d{4})\]\s+([A-Z]+)\s+([A-Za-z]+)[\.\s]+(\d+)", re.IGNORECASE
)
_COURT_PATTERNS = [
    re.compile(r"(Sąd\s+(?:Okręgowy|Rejonowy|Apelacyjny)\s+w\s+\w+)", re.IGNORECASE),
    re.compile(r"(COURT OF APPEAL[^\n]*)", re.IGNORECASE),
    re.compile(r"(Crown Court at\s+\w+)", re.IGNORECASE),
]


def _truncate_with_ellipsis(text: str, max_len: int) -> str:
    """Truncate text for display and append ellipsis if needed."""
    return text[:max_len] + "..." if len(text) > max_len else text


def _extract_docket_number(text_preview: str) -> str:
    """Extract docket or case reference from free text preview."""
    pl_match = _PL_DOCKET_PATTERN.search(text_preview)
    if pl_match:
        return pl_match.group(1)

    uk_match = _UK_CASE_PATTERN.search(text_preview)
    if uk_match:
        return uk_match.group(1)

    neutral_match = _NEUTRAL_CITATION_PATTERN.search(text_preview)
    if neutral_match:
        return (
            f"[{neutral_match.group(1)}] {neutral_match.group(2)} "
            f"{neutral_match.group(3)} {neutral_match.group(4)}"
        )
    return ""


def _extract_court_name(text_preview: str) -> str:
    """Extract court name from text using known patterns."""
    for pattern in _COURT_PATTERNS:
        court_match = pattern.search(text_preview)
        if court_match:
            return court_match.group(1).strip()
    return ""


def _derive_featured_title(doc: dict[str, Any]) -> str:
    """Generate a robust fallback title when source title is missing."""
    title = doc.get("title")
    if title:
        return title

    full_text = doc.get("full_text", "")
    docket_number = doc.get("docket_number", "")
    court_name = doc.get("court_name", "")
    judgment_date = doc.get("judgment_date", "")
    judgment_id = doc.get("judgment_id", "")

    if full_text and not docket_number:
        text_preview = full_text[:500]
        docket_number = _extract_docket_number(text_preview)
        if not court_name:
            court_name = _extract_court_name(text_preview)

    if docket_number:
        if court_name:
            return f"{_truncate_with_ellipsis(court_name, 40)}: {docket_number}"
        return f"Case {docket_number}"

    if court_name and judgment_date and judgment_date != "None":
        return f"{_truncate_with_ellipsis(court_name, 40)} - {judgment_date[:10]}"

    if judgment_id:
        if "_" in judgment_id:
            parts = judgment_id.split("_")
            preferred_id = parts[0] if len(parts[0]) > 5 else judgment_id[:20]
            return f"Judgment {preferred_id}"
        return f"Judgment {judgment_id[:20]}"

    return f"Document {doc.get('id', 'N/A')[:8]}"


def _to_document_summary(doc: dict[str, Any]) -> DocumentSummary:
    """Convert raw document row to dashboard DocumentSummary."""
    return DocumentSummary(
        id=doc.get("id", ""),
        title=_derive_featured_title(doc),
        document_type=doc.get("document_type") or "unknown",
        publication_date=doc.get("date_issued")
        or doc.get("publication_date")
        or doc.get("judgment_date"),
        ai_summary=None,
        key_topics=None,
        jurisdiction=doc.get("country"),
        language=doc.get("language", "pl"),
        issuing_body=doc.get("issuing_body"),
    )


@router.get("/featured-examples", response_model=list[DocumentSummary])
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def get_featured_examples(
    request: Request,
    limit: int = Query(default=5, ge=1, le=10),
    api_key: str = Depends(verify_api_key),
):
    """
    Get curated featured example documents for new users.

    Returns interesting, representative documents to showcase platform capabilities.

    Args:
        limit: Number of examples to return (1-10)

    Returns:
        List of featured documents
    """
    try:
        response = (
            supabase.table("documents")
            .select(
                "id, title, document_type, date_issued, publication_date, "
                "judgment_date, country, language, issuing_body, "
                "full_text, docket_number, court_name, judgment_id"
            )
            .in_("document_type", ["judgment", "tax_interpretation"])
            .not_.is_("title", "null")
            .limit(limit * 3)
            .execute()
        )

        featured: list[DocumentSummary] = []
        seen_types: set[str | None] = set()
        for doc in response.data or []:
            doc_type = doc.get("document_type")
            if doc_type not in seen_types or len(featured) < limit:
                featured.append(_to_document_summary(doc))
                seen_types.add(doc_type)

                if len(featured) >= limit:
                    break

        return featured[:limit]

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching featured examples: {e}", exc_info=True)
        return []


@router.get("/trending-topics", response_model=list[TrendingTopic])
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def get_trending_topics(
    request: Request,
    response: Response,
    category: str | None = None,
    limit: int = Query(default=5, ge=1, le=10),
    api_key: str = Depends(verify_api_key),
):
    """
    Get trending legal topics based on search activity.

    Phase 1 (MVP): Returns curated/editorial topics
    Phase 2 (Future): Algorithm-based trending from search analytics

    Args:
        category: Optional category filter
        limit: Number of topics to return (1-10)

    Returns:
        List of trending topics with metadata
    """
    # For MVP: Return curated trending topics
    curated_topics = [
        TrendingTopic(
            topic="Swiss Franc Loans",
            change="+45%",
            trend="up",
            query_count=1234,
            category="Banking Law",
        ),
        TrendingTopic(
            topic="GDPR Violations",
            change="+32%",
            trend="up",
            query_count=892,
            category="Data Protection",
        ),
        TrendingTopic(
            topic="VAT Deductions",
            change="0%",
            trend="stable",
            query_count=756,
            category="Tax Law",
        ),
        TrendingTopic(
            topic="Employment Contracts",
            change="+18%",
            trend="up",
            query_count=645,
            category="Labor Law",
        ),
        TrendingTopic(
            topic="Corporate Governance",
            change="-5%",
            trend="down",
            query_count=523,
            category="Corporate Law",
        ),
    ]

    # Filter by category if provided
    if category:
        curated_topics = [t for t in curated_topics if t.category == category]

    return curated_topics[:limit]


@router.get("/test-document-counts")
@limiter.limit(DASHBOARD_READ_RATE_LIMIT)
async def test_document_counts(
    request: Request, api_key: str = Depends(verify_api_key)
):
    """
    Test endpoint to verify document counting functionality.

    Returns counts directly from Supabase without caching.
    """
    logger.info("Testing document counts from Supabase...")

    try:
        supabase = get_supabase_client()

        # Get total count
        logger.info("Fetching total document count...")
        total_response = (
            supabase.table("legal_documents")
            .select("document_id", count="exact")
            .execute()
        )
        total_count = total_response.count or 0
        logger.info(f"Total documents: {total_count:,}")

        # Get counts by type
        logger.info("Fetching document counts by type...")
        document_types = [
            "judgment",
            "tax_interpretation",
            "ruling",
            "opinion",
            "legislation",
        ]
        type_counts = {}

        for doc_type in document_types:
            try:
                logger.info(f"Querying {doc_type}...")
                response = (
                    supabase.table("legal_documents")
                    .select("document_id", count="exact")
                    .eq("document_type", doc_type)
                    .execute()
                )
                count = response.count or 0
                if count > 0:
                    type_counts[doc_type] = count
                    logger.info(f"{doc_type}: {count:,}")
            except (PostgrestAPIError, StorageException) as e:
                logger.warning(f"Could not count {doc_type}: {e}")

        # Get recent documents count
        try:
            one_week_ago = datetime.now(UTC) - timedelta(days=7)
            recent_response = (
                supabase.table("legal_documents")
                .select("document_id", count="exact")
                .gte("ingestion_date", one_week_ago.isoformat())
                .execute()
            )
            recent_count = recent_response.count or 0
            logger.info(f"Documents added this week: {recent_count:,}")
        except (PostgrestAPIError, StorageException) as e:
            logger.warning(f"Could not get weekly count: {e}")
            recent_count = 0

        return {
            "status": "success",
            "source": "supabase",
            "total_documents": total_count,
            "by_type": type_counts,
            "added_this_week": recent_count,
            "message": "Document counting is working!",
        }

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error testing document counts: {e}", exc_info=True)
        return {
            "status": "error",
            "message": str(e),
            "total_documents": 0,
            "by_type": {},
            "added_this_week": 0,
        }

"""
Schema Marketplace API - Community platform for sharing extraction schemas.

Provides endpoints for:
1. Browsing and searching marketplace listings
2. Publishing schemas to the marketplace
3. Downloading schemas from the marketplace
4. Rating and reviewing schemas
5. Version history management
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


# ===== Request/Response Models =====


class MarketplaceListingItem(BaseModel):
    """A marketplace listing summary for browse/search views."""

    id: str
    schema_id: str
    publisher_id: str
    title: str
    description: str
    category: str
    tags: list[str] = Field(default_factory=list)
    version: str
    download_count: int = 0
    avg_rating: float = 0.0
    rating_count: int = 0
    status: str = "draft"
    is_featured: bool = False
    license: str = "MIT"
    published_at: str | None = None
    created_at: str
    updated_at: str


class MarketplaceListingDetail(MarketplaceListingItem):
    """Full listing detail including long description and schema data."""

    long_description: str | None = None
    changelog: str | None = None
    schema_data: dict | None = None


class BrowseListingsResponse(BaseModel):
    """Response for browsing marketplace listings."""

    listings: list[MarketplaceListingItem]
    total_count: int
    page: int
    page_size: int
    has_more: bool


class PublishListingRequest(BaseModel):
    """Request to publish a schema to the marketplace."""

    schema_id: str = Field(description="ID of the extraction schema to publish")
    title: str = Field(min_length=3, max_length=200, description="Listing title")
    description: str = Field(
        min_length=10, max_length=1000, description="Short description"
    )
    long_description: str | None = Field(
        default=None, description="Detailed description (markdown)"
    )
    category: str = Field(default="general", description="Schema category")
    tags: list[str] = Field(
        default_factory=list, description="Tags for discoverability"
    )
    version: str = Field(default="1.0.0", description="Semantic version")
    changelog: str | None = Field(default=None, description="Version changelog")
    license: str = Field(default="MIT", description="License type")


class UpdateListingRequest(BaseModel):
    """Request to update a marketplace listing."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10, max_length=1000)
    long_description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    license: str | None = None


class PublishNewVersionRequest(BaseModel):
    """Request to publish a new version of a listing."""

    version: str = Field(description="New semantic version (must be higher)")
    changelog: str | None = Field(
        default=None, description="What changed in this version"
    )


class SubmitReviewRequest(BaseModel):
    """Request to submit a review for a listing."""

    rating: int = Field(ge=1, le=5, description="Rating from 1-5 stars")
    review_text: str | None = Field(
        default=None, max_length=2000, description="Review text"
    )


class ReviewItem(BaseModel):
    """A review on a marketplace listing."""

    id: str
    listing_id: str
    reviewer_id: str
    rating: int
    review_text: str | None = None
    created_at: str
    updated_at: str


class ReviewsResponse(BaseModel):
    """Response containing reviews for a listing."""

    reviews: list[ReviewItem]
    total_count: int
    avg_rating: float


class DownloadResponse(BaseModel):
    """Response after downloading a schema."""

    listing_id: str
    schema_id: str
    schema_data: dict
    version: str
    title: str


class MarketplaceStatsResponse(BaseModel):
    """Overall marketplace statistics."""

    total_listings: int
    total_downloads: int
    total_reviews: int
    categories: list[dict]
    top_rated: list[MarketplaceListingItem]
    most_downloaded: list[MarketplaceListingItem]


# ===== Internal Helpers =====


def _build_published_listings_query(supabase: Any) -> Any:
    """Create a query builder for published marketplace listings."""
    return (
        supabase.table("marketplace_listings")
        .select("*", count="exact")
        .eq("status", "published")
    )


def _apply_search_filter(query_builder: Any, search: str | None) -> Any:
    """Apply full-text-like search over title and description."""
    if not search:
        return query_builder
    return query_builder.or_(f"title.ilike.%{search}%,description.ilike.%{search}%")


def _apply_category_filter(query_builder: Any, category: str | None) -> Any:
    """Apply category filter if provided."""
    if not category:
        return query_builder
    return query_builder.eq("category", category)


def _apply_tags_filter(query_builder: Any, tags: str | None) -> Any:
    """Apply tags contains filter from comma-separated input."""
    if not tags:
        return query_builder
    tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
    if not tag_list:
        return query_builder
    return query_builder.contains("tags", tag_list)


def _apply_sort(query_builder: Any, sort_by: str) -> Any:
    """Apply marketplace sort order."""
    if sort_by == "newest":
        return query_builder.order("published_at", desc=True)
    if sort_by in {"popular", "most_downloaded"}:
        return query_builder.order("download_count", desc=True)
    if sort_by == "top_rated":
        return query_builder.order("avg_rating", desc=True)
    return query_builder


def _apply_pagination(query_builder: Any, page: int, page_size: int) -> tuple[Any, int]:
    """Apply range pagination and return query + offset."""
    offset = (page - 1) * page_size
    paged = query_builder.range(offset, offset + page_size - 1)
    return paged, offset


def _count_rows(supabase: Any, table: str, status: str | None = None) -> int:
    """Count rows in a table with optional status filter."""
    query_builder = supabase.table(table).select("id", count="exact")
    if status:
        query_builder = query_builder.eq("status", status)
    response = query_builder.execute()
    return response.count or 0


def _build_category_counts(items: list[dict[str, Any]]) -> list[dict[str, int | str]]:
    """Convert listing rows into sorted category counts."""
    category_counts: dict[str, int] = {}
    for item in items:
        category = item.get("category", "general")
        category_counts[category] = category_counts.get(category, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(
            category_counts.items(), key=lambda entry: entry[1], reverse=True
        )
    ]


def _fetch_top_listings(
    supabase: Any, order_column: str, limit: int = 5
) -> list[MarketplaceListingItem]:
    """Fetch top published listings by given order column."""
    response = (
        supabase.table("marketplace_listings")
        .select("*")
        .eq("status", "published")
        .order(order_column, desc=True)
        .limit(limit)
        .execute()
    )
    return [MarketplaceListingItem(**item) for item in (response.data or [])]


# ===== Endpoints =====


@router.get(
    "",
    response_model=BrowseListingsResponse,
    summary="Browse marketplace listings",
    description="Browse and search published extraction schemas in the marketplace.",
)
async def browse_listings(
    search: str | None = Query(default=None, description="Search query"),
    category: str | None = Query(default=None, description="Filter by category"),
    tags: str | None = Query(
        default=None, description="Comma-separated tags to filter by"
    ),
    sort_by: Literal["newest", "popular", "top_rated", "most_downloaded"] = Query(
        "newest", description="Sort order"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=50, description="Items per page"),
) -> BrowseListingsResponse:
    """Browse published marketplace listings with search and filters."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        query_builder = _build_published_listings_query(supabase)
        query_builder = _apply_search_filter(query_builder, search)
        query_builder = _apply_category_filter(query_builder, category)
        query_builder = _apply_tags_filter(query_builder, tags)
        query_builder = _apply_sort(query_builder, sort_by)
        query_builder, offset = _apply_pagination(query_builder, page, page_size)

        response = query_builder.execute()
        listings = response.data or []
        total = response.count or 0

        return BrowseListingsResponse(
            listings=[MarketplaceListingItem(**item) for item in listings],
            total_count=total,
            page=page,
            page_size=page_size,
            has_more=(offset + page_size) < total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error browsing marketplace listings: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to browse marketplace listings."
        )


@router.get(
    "/stats",
    response_model=MarketplaceStatsResponse,
    summary="Get marketplace statistics",
)
async def get_marketplace_stats() -> MarketplaceStatsResponse:
    """Get overall marketplace statistics."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        total_listings = _count_rows(
            supabase, table="marketplace_listings", status="published"
        )
        total_downloads = _count_rows(supabase, table="marketplace_downloads")
        total_reviews = _count_rows(supabase, table="marketplace_reviews")

        cat_resp = (
            supabase.table("marketplace_listings")
            .select("category")
            .eq("status", "published")
            .execute()
        )
        categories = _build_category_counts(cat_resp.data or [])
        top_rated = _fetch_top_listings(supabase, order_column="avg_rating")
        most_downloaded = _fetch_top_listings(supabase, order_column="download_count")

        return MarketplaceStatsResponse(
            total_listings=total_listings,
            total_downloads=total_downloads,
            total_reviews=total_reviews,
            categories=categories,
            top_rated=top_rated,
            most_downloaded=most_downloaded,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching marketplace stats: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch marketplace statistics."
        )


@router.get(
    "/my-listings",
    response_model=BrowseListingsResponse,
    summary="Get current user's listings",
)
async def get_my_listings(
    user_id: str = Query(description="Current user ID"),
    status_filter: str | None = Query(default=None, description="Filter by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> BrowseListingsResponse:
    """Get the current user's marketplace listings."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        query_builder = (
            supabase.table("marketplace_listings")
            .select("*", count="exact")
            .eq("publisher_id", user_id)
        )

        if status_filter:
            query_builder = query_builder.eq("status", status_filter)

        query_builder = query_builder.order("updated_at", desc=True)

        offset = (page - 1) * page_size
        query_builder = query_builder.range(offset, offset + page_size - 1)

        response = query_builder.execute()
        listings = response.data or []
        total = response.count or 0

        return BrowseListingsResponse(
            listings=[MarketplaceListingItem(**item) for item in listings],
            total_count=total,
            page=page,
            page_size=page_size,
            has_more=(offset + page_size) < total,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user listings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch your listings.")


@router.get(
    "/{listing_id}",
    response_model=MarketplaceListingDetail,
    summary="Get listing details",
)
async def get_listing_detail(listing_id: str) -> MarketplaceListingDetail:
    """Get full details of a marketplace listing including schema data."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        response = (
            supabase.table("marketplace_listings")
            .select("*, extraction_schemas(text, name, type, category)")
            .eq("id", listing_id)
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Listing not found")

        data = response.data
        schema_info = data.pop("extraction_schemas", None)

        return MarketplaceListingDetail(
            **data,
            schema_data=schema_info.get("text") if schema_info else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching listing detail {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch listing details.")


@router.post(
    "",
    response_model=MarketplaceListingItem,
    summary="Publish a schema to the marketplace",
    status_code=201,
)
async def publish_listing(
    request: PublishListingRequest,
    user_id: str = Query(description="Publisher user ID"),
) -> MarketplaceListingItem:
    """Publish an extraction schema to the marketplace."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify the schema exists and belongs to the user
        schema_resp = (
            supabase.table("extraction_schemas")
            .select("id, user_id, text")
            .eq("id", request.schema_id)
            .single()
            .execute()
        )

        if not schema_resp.data:
            raise HTTPException(status_code=404, detail="Schema not found")

        if schema_resp.data.get("user_id") != user_id:
            raise HTTPException(
                status_code=403, detail="You can only publish your own schemas"
            )

        # Check for duplicate listing of same schema
        existing = (
            supabase.table("marketplace_listings")
            .select("id")
            .eq("schema_id", request.schema_id)
            .eq("publisher_id", user_id)
            .execute()
        )

        if existing.data:
            raise HTTPException(
                status_code=409,
                detail="This schema already has a marketplace listing. Update it instead.",
            )

        # Create the listing
        listing_data = {
            "schema_id": request.schema_id,
            "publisher_id": user_id,
            "title": request.title,
            "description": request.description,
            "long_description": request.long_description,
            "category": request.category,
            "tags": request.tags,
            "version": request.version,
            "changelog": request.changelog,
            "license": request.license,
            "status": "published",
            "published_at": "now()",
        }

        resp = supabase.table("marketplace_listings").insert(listing_data).execute()

        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to create listing")

        created = resp.data[0]

        # Create initial version snapshot
        supabase.table("marketplace_listing_versions").insert(
            {
                "listing_id": created["id"],
                "version": request.version,
                "schema_snapshot": schema_resp.data.get("text", {}),
                "changelog": request.changelog or "Initial release",
            }
        ).execute()

        return MarketplaceListingItem(**created)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing listing: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to publish schema to marketplace."
        )


@router.patch(
    "/{listing_id}",
    response_model=MarketplaceListingItem,
    summary="Update a marketplace listing",
)
async def update_listing(
    listing_id: str,
    request: UpdateListingRequest,
    user_id: str = Query(description="Current user ID"),
) -> MarketplaceListingItem:
    """Update a marketplace listing's metadata."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify ownership
        existing = (
            supabase.table("marketplace_listings")
            .select("publisher_id")
            .eq("id", listing_id)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Listing not found")

        if existing.data.get("publisher_id") != user_id:
            raise HTTPException(
                status_code=403, detail="You can only update your own listings"
            )

        update_data = {k: v for k, v in request.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        resp = (
            supabase.table("marketplace_listings")
            .update(update_data)
            .eq("id", listing_id)
            .execute()
        )

        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to update listing")

        return MarketplaceListingItem(**resp.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating listing {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update listing.")


@router.post(
    "/{listing_id}/download",
    response_model=DownloadResponse,
    summary="Download a schema from the marketplace",
)
async def download_schema(
    listing_id: str,
    user_id: str = Query(description="Downloading user ID"),
) -> DownloadResponse:
    """Download a schema from the marketplace. Records the download for statistics."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Get listing with schema data
        listing_resp = (
            supabase.table("marketplace_listings")
            .select("*, extraction_schemas(text)")
            .eq("id", listing_id)
            .eq("status", "published")
            .single()
            .execute()
        )

        if not listing_resp.data:
            raise HTTPException(
                status_code=404, detail="Listing not found or not published"
            )

        data = listing_resp.data
        schema_info = data.get("extraction_schemas", {})

        # Record the download
        supabase.table("marketplace_downloads").insert(
            {
                "listing_id": listing_id,
                "user_id": user_id,
                "version_downloaded": data.get("version", "1.0.0"),
            }
        ).execute()

        return DownloadResponse(
            listing_id=listing_id,
            schema_id=data["schema_id"],
            schema_data=schema_info.get("text", {}) if schema_info else {},
            version=data.get("version", "1.0.0"),
            title=data.get("title", ""),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading schema {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to download schema.")


@router.post(
    "/{listing_id}/versions",
    summary="Publish a new version of a listing",
    status_code=201,
)
async def publish_new_version(
    listing_id: str,
    request: PublishNewVersionRequest,
    user_id: str = Query(description="Publisher user ID"),
) -> dict:
    """Publish a new version of an existing marketplace listing."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify ownership
        listing_resp = (
            supabase.table("marketplace_listings")
            .select("publisher_id, schema_id, version")
            .eq("id", listing_id)
            .single()
            .execute()
        )

        if not listing_resp.data:
            raise HTTPException(status_code=404, detail="Listing not found")

        if listing_resp.data.get("publisher_id") != user_id:
            raise HTTPException(
                status_code=403, detail="You can only version your own listings"
            )

        # Get current schema data for snapshot
        schema_id = listing_resp.data["schema_id"]
        schema_resp = (
            supabase.table("extraction_schemas")
            .select("text")
            .eq("id", schema_id)
            .single()
            .execute()
        )

        schema_data = schema_resp.data.get("text", {}) if schema_resp.data else {}

        # Create version record
        supabase.table("marketplace_listing_versions").insert(
            {
                "listing_id": listing_id,
                "version": request.version,
                "schema_snapshot": schema_data,
                "changelog": request.changelog,
            }
        ).execute()

        # Update listing version
        supabase.table("marketplace_listings").update(
            {
                "version": request.version,
                "changelog": request.changelog,
            }
        ).eq("id", listing_id).execute()

        return {
            "status": "published",
            "listing_id": listing_id,
            "version": request.version,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing new version for {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to publish new version.")


@router.get(
    "/{listing_id}/versions",
    summary="Get version history for a listing",
)
async def get_version_history(listing_id: str) -> dict:
    """Get version history for a marketplace listing."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        resp = (
            supabase.table("marketplace_listing_versions")
            .select("id, listing_id, version, changelog, created_at")
            .eq("listing_id", listing_id)
            .order("created_at", desc=True)
            .execute()
        )

        return {
            "listing_id": listing_id,
            "versions": resp.data or [],
            "total_count": len(resp.data or []),
        }

    except Exception as e:
        logger.error(f"Error fetching version history for {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch version history.")


@router.get(
    "/{listing_id}/reviews",
    response_model=ReviewsResponse,
    summary="Get reviews for a listing",
)
async def get_listing_reviews(
    listing_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> ReviewsResponse:
    """Get reviews for a marketplace listing."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        offset = (page - 1) * page_size
        resp = (
            supabase.table("marketplace_reviews")
            .select("*", count="exact")
            .eq("listing_id", listing_id)
            .order("created_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )

        reviews = [ReviewItem(**r) for r in (resp.data or [])]
        total = resp.count or 0

        # Get avg rating from listing
        listing_resp = (
            supabase.table("marketplace_listings")
            .select("avg_rating")
            .eq("id", listing_id)
            .single()
            .execute()
        )

        avg_rating = (
            float(listing_resp.data.get("avg_rating", 0)) if listing_resp.data else 0.0
        )

        return ReviewsResponse(
            reviews=reviews,
            total_count=total,
            avg_rating=avg_rating,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching reviews for {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reviews.")


@router.post(
    "/{listing_id}/reviews",
    response_model=ReviewItem,
    summary="Submit a review for a listing",
    status_code=201,
)
async def submit_review(
    listing_id: str,
    request: SubmitReviewRequest,
    user_id: str = Query(description="Reviewer user ID"),
) -> ReviewItem:
    """Submit or update a review for a marketplace listing."""
    supabase = get_supabase_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify listing exists and is published
        listing = (
            supabase.table("marketplace_listings")
            .select("id, publisher_id")
            .eq("id", listing_id)
            .eq("status", "published")
            .single()
            .execute()
        )

        if not listing.data:
            raise HTTPException(
                status_code=404, detail="Listing not found or not published"
            )

        # Prevent self-review
        if listing.data.get("publisher_id") == user_id:
            raise HTTPException(
                status_code=400, detail="You cannot review your own listing"
            )

        # Upsert review (one per user per listing)
        review_data = {
            "listing_id": listing_id,
            "reviewer_id": user_id,
            "rating": request.rating,
            "review_text": request.review_text,
        }

        resp = (
            supabase.table("marketplace_reviews")
            .upsert(
                review_data,
                on_conflict="listing_id,reviewer_id",
            )
            .execute()
        )

        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to submit review")

        return ReviewItem(**resp.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting review for {listing_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit review.")

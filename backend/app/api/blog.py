"""
Blog API endpoints for managing blog posts, categories, tags, likes, and bookmarks.
"""

import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field
from supabase import PostgrestAPIError, StorageException

from app.core.auth_jwt import (
    AuthenticatedUser,
    get_admin_supabase_client,
    get_current_user,
)

router = APIRouter(prefix="/blog", tags=["blog"])

# Column projection for blog_posts — avoids pulling any large/unused fields.
_BLOG_POST_COLS = (
    "id, slug, title, excerpt, content, featured_image, author_id, category, "
    "status, published_at, created_at, updated_at, read_time, views, likes_count, "
    "ai_summary, deleted_at"
)
# Column projection for blog_categories
_BLOG_CATEGORY_COLS = "id, name, description, created_at"


# ==============================================
# MODELS
# ==============================================


class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=255)
    excerpt: str = Field(..., min_length=1)
    content: str | None = None
    featured_image: str | None = Field(None, max_length=500)
    category: str = Field(..., min_length=1, max_length=100)
    tags: list[str] = []
    status: str = Field(default="draft", pattern="^(draft|published|scheduled)$")
    published_at: datetime | None = None
    ai_summary: str | None = None


class BlogPostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=255)
    excerpt: str | None = None
    content: str | None = None
    featured_image: str | None = Field(None, max_length=500)
    category: str | None = None
    tags: list[str] | None = None
    status: str | None = Field(None, pattern="^(draft|published|scheduled)$")
    published_at: datetime | None = None
    ai_summary: str | None = None


class BlogPostResponse(BaseModel):
    id: str
    slug: str
    title: str
    excerpt: str
    content: str | None
    featured_image: str | None
    author: dict
    category: str
    tags: list[str]
    status: str
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    read_time: int | None
    views: int
    likes_count: int
    ai_summary: str | None
    related_posts: list[dict] | None = None


class BlogStatsResponse(BaseModel):
    total_posts: int
    published: int
    drafts: int
    scheduled: int
    total_views: int
    total_likes: int
    avg_read_time: float


# ==============================================
# HELPER FUNCTIONS
# ==============================================


def generate_slug(title: str) -> str:
    """Generate URL-friendly slug from title."""
    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug.strip("-")


def calculate_read_time(content: str) -> int:
    """Calculate reading time in minutes (200 words per minute)."""
    if not content:
        return 0
    words = len(content.split())
    return max(1, round(words / 200))


async def get_post_tags(supabase, post_id: str) -> list[str]:
    """Get tags for a post."""
    try:
        response = (
            supabase.table("blog_tags").select("tag").eq("post_id", post_id).execute()
        )
        return [row["tag"] for row in response.data]
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching tags: {e}", exc_info=True)
        return []


async def get_post_author(supabase, author_id: str) -> dict:
    """Get author information."""
    try:
        response = (
            supabase.table("user_profiles")
            .select("id, name, email, avatar, title")
            .eq("id", author_id)
            .single()
            .execute()
        )

        if response.data:
            return {
                "id": response.data["id"],
                "name": response.data.get("name") or "Anonymous",
                "email": response.data.get("email"),
                "avatar": response.data.get("avatar"),
                "title": response.data.get("title") or "Researcher",
            }
    except (PostgrestAPIError, StorageException) as e:
        logger.warning(f"Could not fetch author profile for {author_id}: {e}")

    return {"id": author_id, "name": "Anonymous", "title": "Researcher", "avatar": None}


async def increment_view_count(supabase, post_id: str):
    """Increment view count for a post."""
    try:
        supabase.table("blog_posts").update(
            {"views": supabase.rpc("increment", {"x": 1})}
        ).eq("id", post_id).execute()
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error incrementing view count: {e}", exc_info=True)


def ensure_user_can_access_post(
    post: dict[str, Any], current_user: AuthenticatedUser
) -> None:
    """Allow access for post author or platform admin."""
    if post.get("author_id") != current_user.id and not current_user.is_admin():
        raise HTTPException(
            status_code=403, detail="Not authorized to access this post"
        )


def normalize_post_response(
    post: dict[str, Any], tags: list[str], author: dict
) -> dict[str, Any]:
    """Normalize DB shape to frontend blog type shape."""
    return {
        "id": post["id"],
        "slug": post["slug"],
        "title": post["title"],
        "excerpt": post.get("excerpt", ""),
        "content": post.get("content"),
        "featured_image": post.get("featured_image"),
        "author": author,
        "category": post.get("category", "Research"),
        "tags": tags,
        "status": post.get("status", "draft"),
        "published_at": post.get("published_at"),
        "created_at": post.get("created_at"),
        "updated_at": post.get("updated_at"),
        "read_time": post.get("read_time"),
        "views": post.get("views", 0) or 0,
        "likes": post.get("likes_count", 0) or 0,
        "ai_summary": post.get("ai_summary"),
    }


def ensure_unique_slug(
    supabase, desired_slug: str, exclude_post_id: str | None = None
) -> str:
    """Ensure slug is unique by appending numeric suffix when needed."""
    base_slug = desired_slug
    candidate = base_slug
    attempt = 1

    while True:
        query = supabase.table("blog_posts").select("id").eq("slug", candidate)
        if exclude_post_id:
            query = query.neq("id", exclude_post_id)
        response = query.is_("deleted_at", "null").limit(1).execute()

        if not response.data:
            return candidate

        attempt += 1
        candidate = f"{base_slug}-{attempt}"


# ==============================================
# PUBLIC ENDPOINTS
# ==============================================


@router.get("/posts")
async def list_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    sort: str = Query(
        "published_at", pattern="^(published_at|views|likes_count|created_at)$"
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """
    List published blog posts with pagination and filters.
    """
    try:
        supabase = get_admin_supabase_client()

        # Build query
        query = (
            supabase.table("blog_posts")
            .select("*, author_id")
            .eq("status", "published")
            .is_("deleted_at", "null")
        )

        # Apply filters
        if category:
            query = query.eq("category", category)

        if search:
            query = query.or_(f"title.ilike.%{search}%,excerpt.ilike.%{search}%")

        # Sorting
        query = query.order(sort, desc=(order == "desc"))

        # Pagination
        offset = (page - 1) * limit
        query = query.range(offset, offset + limit - 1)

        # Execute query
        response = query.execute()

        # Enrich posts with tags and author
        posts = []
        for post in response.data:
            tags = await get_post_tags(supabase, post["id"])
            author = await get_post_author(supabase, post["author_id"])

            # Filter by tag if specified
            if tag and tag not in tags:
                continue

            posts.append({**post, "tags": tags, "author": author})

        # Get total count
        count_response = (
            supabase.table("blog_posts")
            .select("id", count="exact")
            .eq("status", "published")
            .is_("deleted_at", "null")
            .execute()
        )

        total = count_response.count or 0
        total_pages = (total + limit - 1) // limit

        return {
            "data": posts,
            "pagination": {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        }

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error listing posts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch blog posts")


@router.get("/posts/{slug}")
async def get_post(slug: str):
    """
    Get a single published blog post by slug.
    """
    try:
        supabase = get_admin_supabase_client()

        # Get post
        response = (
            supabase.table("blog_posts")
            .select(_BLOG_POST_COLS)
            .eq("slug", slug)
            .eq("status", "published")
            .is_("deleted_at", "null")
            .single()
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Post not found")

        post = response.data

        # Get tags and author
        tags = await get_post_tags(supabase, post["id"])
        author = await get_post_author(supabase, post["author_id"])

        # Get related posts (same category, different post)
        related_response = (
            supabase.table("blog_posts")
            .select("id, slug, title, excerpt, featured_image, category, read_time")
            .eq("category", post["category"])
            .neq("id", post["id"])
            .eq("status", "published")
            .is_("deleted_at", "null")
            .limit(3)
            .execute()
        )

        # Increment view count (async, non-blocking)
        await increment_view_count(supabase, post["id"])

        return {
            **post,
            "tags": tags,
            "author": author,
            "related_posts": related_response.data or [],
        }

    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching post: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch blog post")


@router.get("/categories")
async def list_categories():
    """
    Get all blog categories.
    """
    try:
        supabase = get_admin_supabase_client()

        response = (
            supabase.table("blog_categories").select(_BLOG_CATEGORY_COLS).execute()
        )

        # Add post count for each category
        categories = []
        for cat in response.data:
            count_response = (
                supabase.table("blog_posts")
                .select("id", count="exact")
                .eq("category", cat["name"])
                .eq("status", "published")
                .execute()
            )

            categories.append({**cat, "post_count": count_response.count or 0})

        return {"data": categories}

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching categories: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


# ==============================================
# PROTECTED ENDPOINTS (REQUIRE AUTH)
# ==============================================


@router.post("/posts/{slug}/like")
async def toggle_like(
    slug: str, current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Toggle like status for a post.
    """
    try:
        supabase = get_admin_supabase_client()

        # Get post
        post_response = (
            supabase.table("blog_posts")
            .select("id")
            .eq("slug", slug)
            .single()
            .execute()
        )

        if not post_response.data:
            raise HTTPException(status_code=404, detail="Post not found")

        post_id = post_response.data["id"]

        # Check if already liked
        like_response = (
            supabase.table("blog_likes")
            .select("id")
            .eq("post_id", post_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if like_response.data:
            # Unlike
            supabase.table("blog_likes").delete().eq(
                "id", like_response.data[0]["id"]
            ).execute()
            liked = False
        else:
            # Like
            supabase.table("blog_likes").insert(
                {"post_id": post_id, "user_id": current_user.id}
            ).execute()
            liked = True

        # Get updated like count
        post = (
            supabase.table("blog_posts")
            .select("likes_count")
            .eq("id", post_id)
            .single()
            .execute()
        )

        return {"success": True, "liked": liked, "likes": post.data["likes_count"]}

    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error toggling like: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to toggle like")


@router.post("/posts/{slug}/bookmark")
async def toggle_bookmark(
    slug: str, current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Toggle bookmark status for a post.
    """
    try:
        supabase = get_admin_supabase_client()

        # Get post
        post_response = (
            supabase.table("blog_posts")
            .select("id")
            .eq("slug", slug)
            .single()
            .execute()
        )

        if not post_response.data:
            raise HTTPException(status_code=404, detail="Post not found")

        post_id = post_response.data["id"]

        # Check if already bookmarked
        bookmark_response = (
            supabase.table("blog_bookmarks")
            .select("id")
            .eq("post_id", post_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if bookmark_response.data:
            # Remove bookmark
            supabase.table("blog_bookmarks").delete().eq(
                "id", bookmark_response.data[0]["id"]
            ).execute()
            bookmarked = False
        else:
            # Add bookmark
            supabase.table("blog_bookmarks").insert(
                {"post_id": post_id, "user_id": current_user.id}
            ).execute()
            bookmarked = True

        return {"success": True, "bookmarked": bookmarked}

    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error toggling bookmark: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to toggle bookmark")


@router.get("/bookmarks")
async def get_bookmarks(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Get all bookmarked posts for the current user.
    """
    try:
        supabase = get_admin_supabase_client()

        response = (
            supabase.table("blog_bookmarks")
            .select("*, blog_posts(*)")
            .eq("user_id", current_user.id)
            .execute()
        )

        bookmarks = []
        for bookmark in response.data:
            post = bookmark["blog_posts"]
            bookmarks.append(
                {
                    "id": post["id"],
                    "slug": post["slug"],
                    "title": post["title"],
                    "excerpt": post["excerpt"],
                    "featured_image": post["featured_image"],
                    "bookmarked_at": bookmark["created_at"],
                }
            )

        return {"data": bookmarks}

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching bookmarks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch bookmarks")


# ==============================================
# ADMIN ENDPOINTS
# ==============================================


@router.post("/admin/posts")
async def create_post(
    post: BlogPostCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Create a new blog post (admin only).
    """
    try:
        supabase = get_admin_supabase_client()

        # Generate slug if not provided
        raw_slug = post.slug or generate_slug(post.title)
        slug = ensure_unique_slug(supabase, raw_slug)

        # Calculate read time
        read_time = calculate_read_time(post.content or "")
        published_at = post.published_at
        if post.status == "published" and not published_at:
            published_at = datetime.now(UTC)

        # Insert post
        post_data = {
            "title": post.title,
            "slug": slug,
            "excerpt": post.excerpt,
            "content": post.content,
            "featured_image": post.featured_image,
            "author_id": current_user.id,
            "category": post.category,
            "status": post.status,
            "published_at": published_at,
            "read_time": read_time,
            "ai_summary": post.ai_summary,
        }

        response = supabase.table("blog_posts").insert(post_data).execute()

        if not response.data:
            raise HTTPException(
                status_code=500, detail="Blog post creation returned no data"
            )

        created_post = response.data[0]

        # Insert tags
        if post.tags:
            tags_data = [
                {"post_id": created_post["id"], "tag": tag} for tag in post.tags
            ]
            supabase.table("blog_tags").insert(tags_data).execute()

        tags = await get_post_tags(supabase, created_post["id"])
        author = await get_post_author(supabase, created_post["author_id"])
        normalized_post = normalize_post_response(created_post, tags, author)

        return {"success": True, "data": normalized_post}

    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error creating post: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create blog post")


@router.get("/admin/posts")
async def list_admin_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, pattern="^(draft|published|scheduled)$"),
    search: str | None = None,
    sort: str = Query(
        "updated_at",
        pattern="^(updated_at|created_at|published_at|views|likes_count|title)$",
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    List blog posts for admin UI.
    Non-admin users only see their own posts.
    """
    try:
        supabase = get_admin_supabase_client()
        offset = (page - 1) * limit

        list_query = (
            supabase.table("blog_posts")
            .select(_BLOG_POST_COLS)
            .is_("deleted_at", "null")
        )
        count_query = (
            supabase.table("blog_posts")
            .select("id", count="exact")
            .is_("deleted_at", "null")
        )

        if not current_user.is_admin():
            list_query = list_query.eq("author_id", current_user.id)
            count_query = count_query.eq("author_id", current_user.id)

        if status:
            list_query = list_query.eq("status", status)
            count_query = count_query.eq("status", status)

        if search:
            search_clause = f"title.ilike.%{search}%,excerpt.ilike.%{search}%"
            list_query = list_query.or_(search_clause)
            count_query = count_query.or_(search_clause)

        response = (
            list_query.order(sort, desc=(order == "desc"))
            .range(offset, offset + limit - 1)
            .execute()
        )
        count_response = count_query.execute()

        posts = []
        for post in response.data or []:
            tags = await get_post_tags(supabase, post["id"])
            author = await get_post_author(supabase, post["author_id"])
            posts.append(normalize_post_response(post, tags, author))

        total = count_response.count or 0
        total_pages = (total + limit - 1) // limit if total > 0 else 1

        return {
            "data": posts,
            "pagination": {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            },
        }
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error listing admin posts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch admin blog posts")


@router.get("/admin/posts/{post_id}")
async def get_admin_post(
    post_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Get a single post for admin edit UI."""
    try:
        supabase = get_admin_supabase_client()
        response = (
            supabase.table("blog_posts")
            .select(_BLOG_POST_COLS)
            .eq("id", post_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        )

        post = response.data
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        ensure_user_can_access_post(post, current_user)

        tags = await get_post_tags(supabase, post["id"])
        author = await get_post_author(supabase, post["author_id"])
        return {"success": True, "data": normalize_post_response(post, tags, author)}
    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching admin post {post_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch blog post")


@router.put("/admin/posts/{post_id}")
async def update_post(
    post_id: str,
    post: BlogPostUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Update an existing blog post."""
    try:
        supabase = get_admin_supabase_client()
        existing_response = (
            supabase.table("blog_posts")
            .select(_BLOG_POST_COLS)
            .eq("id", post_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        )
        existing_post = existing_response.data
        if not existing_post:
            raise HTTPException(status_code=404, detail="Post not found")

        ensure_user_can_access_post(existing_post, current_user)

        update_data: dict[str, Any] = {}
        if post.title is not None:
            update_data["title"] = post.title
        if post.slug is not None:
            update_data["slug"] = ensure_unique_slug(
                supabase, generate_slug(post.slug), exclude_post_id=post_id
            )
        if post.excerpt is not None:
            update_data["excerpt"] = post.excerpt
        if post.content is not None:
            update_data["content"] = post.content
            update_data["read_time"] = calculate_read_time(post.content)
        if post.featured_image is not None:
            update_data["featured_image"] = post.featured_image
        if post.category is not None:
            update_data["category"] = post.category
        if post.ai_summary is not None:
            update_data["ai_summary"] = post.ai_summary
        if post.status is not None:
            update_data["status"] = post.status
            if (
                post.status == "published"
                and existing_post.get("status") != "published"
                and post.published_at is None
            ):
                update_data["published_at"] = datetime.now(UTC).isoformat()
        if post.published_at is not None:
            update_data["published_at"] = post.published_at.isoformat()

        if update_data:
            update_data["updated_at"] = datetime.now(UTC).isoformat()
            supabase.table("blog_posts").update(update_data).eq("id", post_id).execute()

        if post.tags is not None:
            supabase.table("blog_tags").delete().eq("post_id", post_id).execute()
            if post.tags:
                tags_data = [{"post_id": post_id, "tag": tag} for tag in post.tags]
                supabase.table("blog_tags").insert(tags_data).execute()

        updated_response = (
            supabase.table("blog_posts")
            .select(_BLOG_POST_COLS)
            .eq("id", post_id)
            .single()
            .execute()
        )
        updated_post = updated_response.data
        tags = await get_post_tags(supabase, post_id)
        author = await get_post_author(supabase, updated_post["author_id"])

        return {
            "success": True,
            "data": normalize_post_response(updated_post, tags, author),
        }
    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error updating post {post_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update blog post")


@router.delete("/admin/posts/{post_id}")
async def delete_post(
    post_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Soft-delete a blog post."""
    try:
        supabase = get_admin_supabase_client()
        response = (
            supabase.table("blog_posts")
            .select("id, author_id")
            .eq("id", post_id)
            .is_("deleted_at", "null")
            .single()
            .execute()
        )
        post = response.data
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        ensure_user_can_access_post(post, current_user)

        now = datetime.now(UTC).isoformat()
        supabase.table("blog_posts").update({"deleted_at": now, "updated_at": now}).eq(
            "id", post_id
        ).execute()

        return {"success": True, "deleted_id": post_id}
    except HTTPException:
        raise
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error deleting post {post_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete blog post")


@router.get("/admin/stats", response_model=BlogStatsResponse)
async def get_admin_blog_stats(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Get blog statistics for admin UI."""
    try:
        supabase = get_admin_supabase_client()
        query = (
            supabase.table("blog_posts")
            .select("status, views, likes_count, read_time")
            .is_("deleted_at", "null")
        )

        if not current_user.is_admin():
            query = query.eq("author_id", current_user.id)

        response = query.execute()
        rows = response.data or []

        total_posts = len(rows)
        published = sum(1 for row in rows if row.get("status") == "published")
        drafts = sum(1 for row in rows if row.get("status") == "draft")
        scheduled = sum(1 for row in rows if row.get("status") == "scheduled")
        total_views = sum((row.get("views", 0) or 0) for row in rows)
        total_likes = sum((row.get("likes_count", 0) or 0) for row in rows)
        read_times = [
            row.get("read_time", 0) or 0 for row in rows if row.get("read_time")
        ]
        avg_read_time = sum(read_times) / len(read_times) if len(read_times) > 0 else 0

        return BlogStatsResponse(
            total_posts=total_posts,
            published=published,
            drafts=drafts,
            scheduled=scheduled,
            total_views=total_views,
            total_likes=total_likes,
            avg_read_time=avg_read_time,
        )
    except (PostgrestAPIError, StorageException) as e:
        logger.error(f"Error fetching blog stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch blog stats")

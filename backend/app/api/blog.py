"""
Blog API endpoints for managing blog posts, categories, tags, likes, and bookmarks.
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from loguru import logger
import re

from ..dependencies import get_supabase_db, get_current_user


router = APIRouter(prefix="/blog", tags=["blog"])


# ==============================================
# MODELS
# ==============================================


class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    excerpt: str = Field(..., min_length=1)
    content: Optional[str] = None
    featured_image: Optional[str] = Field(None, max_length=500)
    category: str = Field(..., min_length=1, max_length=100)
    tags: List[str] = []
    status: str = Field(default="draft", pattern="^(draft|published|scheduled)$")
    published_at: Optional[datetime] = None
    ai_summary: Optional[str] = None


class BlogPostUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    slug: Optional[str] = Field(None, max_length=255)
    excerpt: Optional[str] = None
    content: Optional[str] = None
    featured_image: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = Field(None, pattern="^(draft|published|scheduled)$")
    published_at: Optional[datetime] = None
    ai_summary: Optional[str] = None


class BlogPostResponse(BaseModel):
    id: str
    slug: str
    title: str
    excerpt: str
    content: Optional[str]
    featured_image: Optional[str]
    author: dict
    category: str
    tags: List[str]
    status: str
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    read_time: Optional[int]
    views: int
    likes_count: int
    ai_summary: Optional[str]
    related_posts: Optional[List[dict]] = None


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


async def get_post_tags(supabase, post_id: str) -> List[str]:
    """Get tags for a post."""
    try:
        response = (
            supabase.table("blog_tags").select("tag").eq("post_id", post_id).execute()
        )
        return [row["tag"] for row in response.data]
    except Exception as e:
        logger.error(f"Error fetching tags: {e}")
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
    except Exception:
        pass

    return {"id": author_id, "name": "Anonymous", "title": "Researcher", "avatar": None}


async def increment_view_count(supabase, post_id: str):
    """Increment view count for a post."""
    try:
        supabase.table("blog_posts").update(
            {"views": supabase.rpc("increment", {"x": 1})}
        ).eq("id", post_id).execute()
    except Exception as e:
        logger.error(f"Error incrementing view count: {e}")


# ==============================================
# PUBLIC ENDPOINTS
# ==============================================


@router.get("/posts")
async def list_posts(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    category: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query(
        "published_at", pattern="^(published_at|views|likes_count|created_at)$"
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    supabase=Depends(get_supabase_db),
):
    """
    List published blog posts with pagination and filters.
    """
    try:
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

    except Exception as e:
        logger.error(f"Error listing posts: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch blog posts")


@router.get("/posts/{slug}")
async def get_post(slug: str, supabase=Depends(get_supabase_db)):
    """
    Get a single published blog post by slug.
    """
    try:
        # Get post
        response = (
            supabase.table("blog_posts")
            .select("*")
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
    except Exception as e:
        logger.error(f"Error fetching post: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch blog post")


@router.get("/categories")
async def list_categories(supabase=Depends(get_supabase_db)):
    """
    Get all blog categories.
    """
    try:
        response = supabase.table("blog_categories").select("*").execute()

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

    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


# ==============================================
# PROTECTED ENDPOINTS (REQUIRE AUTH)
# ==============================================


@router.post("/posts/{slug}/like")
async def toggle_like(
    slug: str, current_user=Depends(get_current_user), supabase=Depends(get_supabase_db)
):
    """
    Toggle like status for a post.
    """
    try:
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
            .eq("user_id", current_user["id"])
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
                {"post_id": post_id, "user_id": current_user["id"]}
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
    except Exception as e:
        logger.error(f"Error toggling like: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle like")


@router.post("/posts/{slug}/bookmark")
async def toggle_bookmark(
    slug: str, current_user=Depends(get_current_user), supabase=Depends(get_supabase_db)
):
    """
    Toggle bookmark status for a post.
    """
    try:
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
            .eq("user_id", current_user["id"])
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
                {"post_id": post_id, "user_id": current_user["id"]}
            ).execute()
            bookmarked = True

        return {"success": True, "bookmarked": bookmarked}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling bookmark: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle bookmark")


@router.get("/bookmarks")
async def get_bookmarks(
    current_user=Depends(get_current_user), supabase=Depends(get_supabase_db)
):
    """
    Get all bookmarked posts for the current user.
    """
    try:
        response = (
            supabase.table("blog_bookmarks")
            .select("*, blog_posts(*)")
            .eq("user_id", current_user["id"])
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

    except Exception as e:
        logger.error(f"Error fetching bookmarks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch bookmarks")


# ==============================================
# ADMIN ENDPOINTS
# ==============================================


@router.post("/admin/posts")
async def create_post(
    post: BlogPostCreate,
    current_user=Depends(get_current_user),
    supabase=Depends(get_supabase_db),
):
    """
    Create a new blog post (admin only).
    """
    try:
        # Generate slug if not provided
        slug = post.slug or generate_slug(post.title)

        # Calculate read time
        read_time = calculate_read_time(post.content or "")

        # Insert post
        post_data = {
            "title": post.title,
            "slug": slug,
            "excerpt": post.excerpt,
            "content": post.content,
            "featured_image": post.featured_image,
            "author_id": current_user["id"],
            "category": post.category,
            "status": post.status,
            "published_at": post.published_at,
            "read_time": read_time,
            "ai_summary": post.ai_summary,
        }

        response = supabase.table("blog_posts").insert(post_data).execute()

        created_post = response.data[0]

        # Insert tags
        if post.tags:
            tags_data = [
                {"post_id": created_post["id"], "tag": tag} for tag in post.tags
            ]
            supabase.table("blog_tags").insert(tags_data).execute()

        return {"success": True, "data": created_post}

    except Exception as e:
        logger.error(f"Error creating post: {e}")
        raise HTTPException(status_code=500, detail="Failed to create blog post")


# TODO: Add more admin endpoints (update, delete, stats, etc.)

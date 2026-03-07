"""
Smart document recommendations endpoint.

Recommends relevant documents based on user's search history, viewed documents,
and current research context. Uses a hybrid approach combining:
- Content-based filtering (vector similarity via embeddings)
- Collaborative signals (user interactions, search history)
- Recency and diversity scoring
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger
from pydantic import BaseModel, Field

from app.core.supabase import get_supabase_client
from app.documents import generate_embedding
from app.models import validate_id_format

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


# ===== Request/Response Models =====


class RecommendationItem(BaseModel):
    """A single recommended document."""

    document_id: str = Field(description="Document ID")
    title: str | None = Field(default=None, description="Document title")
    document_type: str | None = Field(default=None, description="Document type")
    date_issued: str | None = Field(default=None, description="Date issued")
    document_number: str | None = Field(default=None, description="Document number")
    court_name: str | None = Field(default=None, description="Court name")
    language: str | None = Field(default=None, description="Language")
    summary: str | None = Field(default=None, description="Document summary snippet")
    score: float = Field(description="Recommendation relevance score (0-1)")
    reason: str = Field(description="Why this document is recommended")


class RecommendationsResponse(BaseModel):
    """Response with recommended documents."""

    recommendations: list[RecommendationItem] = Field(
        description="List of recommended documents"
    )
    strategy: str = Field(
        description="Strategy used: content_based, history_based, or hybrid"
    )
    total_found: int = Field(description="Total recommendations found")


class TrackInteractionRequest(BaseModel):
    """Request to track a user-document interaction."""

    document_id: str = Field(description="Document ID interacted with")
    interaction_type: Literal[
        "view",
        "search_click",
        "bookmark",
        "chat_reference",
        "feedback_positive",
        "feedback_negative",
    ] = Field(description="Type of interaction")
    context: dict | None = Field(
        default=None,
        description="Optional context (e.g., search query that led to this)",
    )


# ===== Interaction Weights =====

INTERACTION_WEIGHTS = {
    "view": 1.0,
    "search_click": 1.5,
    "bookmark": 3.0,
    "chat_reference": 2.0,
    "feedback_positive": 4.0,
    "feedback_negative": -2.0,
}


def _resolve_effective_strategy(
    strategy: Literal["auto", "content_based", "history_based", "hybrid"],
    user_id: str | None,
    query: str | None,
    document_id: str | None,
) -> Literal["content_based", "history_based", "hybrid"]:
    """Resolve auto strategy into a concrete recommendation strategy."""
    if strategy != "auto":
        return strategy
    if document_id or query:
        return "content_based"
    if user_id:
        return "hybrid"
    return "content_based"


def _merge_unique_recommendations(
    base: list[RecommendationItem], extra: list[RecommendationItem]
) -> list[RecommendationItem]:
    """Merge recommendations, preserving uniqueness by document_id."""
    existing_ids = {item.document_id for item in base}
    merged = list(base)
    for rec in extra:
        if rec.document_id in existing_ids:
            continue
        existing_ids.add(rec.document_id)
        merged.append(rec)
    return merged


def _embedding_source_text(document_data: dict[str, Any] | None) -> str | None:
    """Build candidate text payload for embedding generation."""
    if not document_data:
        return None
    return (
        document_data.get("summary")
        or document_data.get("title")
        or document_data.get("full_text", "")[:2000]
    )


async def _resolve_embedding_for_context(
    db: Any,
    query: str | None,
    document_id: str | None,
) -> list[float] | None:
    """Resolve embedding from source document first, then fallback to query."""
    if document_id:
        doc_data = await db.get_document_by_id(document_id)
        if doc_data:
            embedding = doc_data.get("embedding")
            if embedding:
                return embedding
            text = _embedding_source_text(doc_data)
            if text:
                return await generate_embedding(text)

    if query:
        return await generate_embedding(query)

    return None


def _build_recommendation_item(
    result: dict[str, Any], score: float, reason: str
) -> RecommendationItem:
    """Convert vector-search result dict to RecommendationItem."""
    return RecommendationItem(
        document_id=result.get("document_id", ""),
        title=result.get("title"),
        document_type=result.get("document_type"),
        date_issued=result.get("date_issued"),
        document_number=result.get("document_number"),
        court_name=result.get("court_name"),
        language=result.get("language"),
        summary=_truncate(result.get("summary"), 200),
        score=round(score, 3),
        reason=reason,
    )


def _weighted_documents_from_interactions(
    interactions: list[dict[str, Any]],
) -> list[tuple[str, float]]:
    """Build sorted document weight profile from interaction events."""
    doc_weights: dict[str, float] = {}
    for interaction in interactions:
        doc_id = interaction.get("document_id")
        if not doc_id:
            continue
        weight = INTERACTION_WEIGHTS.get(interaction.get("interaction_type"), 1.0)
        doc_weights[doc_id] = doc_weights.get(doc_id, 0) + weight
    return sorted(doc_weights.items(), key=lambda item: item[1], reverse=True)


# ===== Endpoints =====


@router.get(
    "",
    response_model=RecommendationsResponse,
    summary="Get smart document recommendations",
    description="Get personalized document recommendations based on search history, "
    "viewed documents, and research context.",
)
async def get_recommendations(
    user_id: str | None = Query(
        default=None, description="User ID for personalized recommendations"
    ),
    query: str | None = Query(
        default=None, description="Optional query for context-aware recommendations"
    ),
    document_id: str | None = Query(
        default=None,
        description="Optional document ID for similar-document recommendations",
    ),
    limit: int = Query(10, ge=1, le=50, description="Number of recommendations"),
    strategy: Literal["auto", "content_based", "history_based", "hybrid"] = Query(
        "auto", description="Recommendation strategy to use"
    ),
) -> RecommendationsResponse:
    """Get smart document recommendations using hybrid approach."""
    if document_id:
        try:
            validate_id_format(document_id, "document_id")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    try:
        effective_strategy = _resolve_effective_strategy(
            strategy=strategy, user_id=user_id, query=query, document_id=document_id
        )

        recommendations: list[RecommendationItem] = []
        if effective_strategy in ("content_based", "hybrid"):
            recommendations.extend(
                await _get_content_based_recommendations(
                    query=query, document_id=document_id, limit=limit
                )
            )

        if effective_strategy in ("history_based", "hybrid") and user_id:
            history_recs = await _get_history_based_recommendations(
                user_id=user_id, limit=limit
            )
            recommendations = _merge_unique_recommendations(
                base=recommendations, extra=history_recs
            )

        recommendations = sorted(
            recommendations, key=lambda item: item.score, reverse=True
        )[:limit]

        return RecommendationsResponse(
            recommendations=recommendations,
            strategy=effective_strategy,
            total_found=len(recommendations),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail="Error generating recommendations.")


@router.post(
    "/track",
    summary="Track user-document interaction",
    description="Record a user interaction with a document for improving recommendations.",
)
async def track_interaction(
    request: TrackInteractionRequest,
    user_id: str | None = Query(default=None, description="User ID"),
) -> dict:
    """Track a user interaction with a document."""
    try:
        validate_id_format(request.document_id, "document_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not user_id:
        return {"status": "skipped", "reason": "No user ID provided"}

    try:
        supabase = get_supabase_client()
        if not supabase:
            logger.warning("Supabase client not available for interaction tracking")
            return {"status": "skipped", "reason": "Storage unavailable"}

        supabase.table("user_document_interactions").insert(
            {
                "user_id": user_id,
                "document_id": request.document_id,
                "interaction_type": request.interaction_type,
                "context": request.context or {},
            }
        ).execute()

        return {"status": "tracked"}

    except Exception as e:
        logger.error(f"Error tracking interaction: {e}")
        # Non-critical, don't fail the request
        return {"status": "error", "reason": str(e)}


# ===== Internal Functions =====


async def _get_content_based_recommendations(
    query: str | None = None,
    document_id: str | None = None,
    limit: int = 10,
) -> list[RecommendationItem]:
    """Get recommendations based on content similarity."""
    db = get_vector_db()
    embedding = await _resolve_embedding_for_context(
        db=db, query=query, document_id=document_id
    )

    if not embedding:
        # Fallback: get recent documents
        return await _get_recent_documents(limit)

    # Search by vector similarity
    similar_results = await db.search_by_vector(
        query_embedding=embedding,
        match_count=limit + 1,
        match_threshold=0.3,
    )

    results: list[RecommendationItem] = []
    for result in similar_results:
        # Skip the source document itself
        if document_id and result.get("document_id") == document_id:
            continue
        if len(results) >= limit:
            break

        similarity = result.get("similarity", 0.0)
        results.append(
            _build_recommendation_item(
                result=result,
                score=similarity,
                reason=_content_reason(similarity, document_id, query),
            )
        )

    return results


async def _get_history_based_recommendations(
    user_id: str,
    limit: int = 10,
) -> list[RecommendationItem]:
    """Get recommendations based on user's interaction history."""
    supabase = get_supabase_client()
    if not supabase:
        return []

    try:
        # Get recent user interactions
        response = (
            supabase.table("user_document_interactions")
            .select("document_id, interaction_type")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )

        interactions = response.data or []

        if not interactions:
            # Try search_queries table as fallback
            return await _get_search_history_recommendations(user_id, limit)

        # Get top interacted documents
        top_docs = _weighted_documents_from_interactions(interactions)[:5]

        if not top_docs:
            return []

        # For the most-interacted document, find similar ones
        db = get_vector_db()
        all_recs: list[RecommendationItem] = []
        seen_ids = {doc_id for doc_id, _ in top_docs}

        for doc_id, weight in top_docs[:3]:
            doc_data = await db.get_document_by_id(doc_id)
            if not doc_data:
                continue

            embedding = doc_data.get("embedding")
            if not embedding:
                text = _embedding_source_text(doc_data)
                if text:
                    embedding = await generate_embedding(text)

            if not embedding:
                continue

            similar = await db.search_by_vector(
                query_embedding=embedding,
                match_count=limit,
                match_threshold=0.35,
            )

            for result in similar:
                rid = result.get("document_id", "")
                if rid in seen_ids:
                    continue
                seen_ids.add(rid)

                similarity = result.get("similarity", 0.0)
                # Boost score by interaction weight
                boosted_score = similarity * (1 + weight * 0.1)
                boosted_score = min(boosted_score, 1.0)

                all_recs.append(
                    _build_recommendation_item(
                        result=result,
                        score=boosted_score,
                        reason="Based on your research history",
                    )
                )

        all_recs.sort(key=lambda r: r.score, reverse=True)
        return all_recs[:limit]

    except Exception as e:
        logger.error(f"Error getting history-based recommendations: {e}")
        return []


async def _get_search_history_recommendations(
    user_id: str,
    limit: int = 10,
) -> list[RecommendationItem]:
    """Fallback: derive recommendations from search_queries table."""
    supabase = get_supabase_client()
    if not supabase:
        return []

    try:
        response = (
            supabase.table("search_queries")
            .select("query")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )

        queries = response.data or []
        if not queries:
            return []

        # Combine recent queries into a single context
        combined = " ".join(q["query"] for q in queries)
        embedding = await generate_embedding(combined[:8000])

        db = get_vector_db()
        similar = await db.search_by_vector(
            query_embedding=embedding,
            match_count=limit,
            match_threshold=0.3,
        )

        results: list[RecommendationItem] = []
        for result in similar:
            if len(results) >= limit:
                break
            similarity = result.get("similarity", 0.0)
            results.append(
                _build_recommendation_item(
                    result=result,
                    score=similarity,
                    reason="Related to your recent searches",
                )
            )

        return results

    except Exception as e:
        logger.error(f"Error getting search history recommendations: {e}")
        return []


async def _get_recent_documents(limit: int = 10) -> list[RecommendationItem]:
    """Fallback: return recently added documents."""
    supabase = get_supabase_client()
    if not supabase:
        return []

    try:
        response = (
            supabase.table("legal_documents")
            .select(
                "document_id, title, document_type, date_issued, "
                "document_number, court_name, language, summary"
            )
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        docs = response.data if response.data else []
        return [
            RecommendationItem(
                document_id=doc["document_id"],
                title=doc.get("title"),
                document_type=doc.get("document_type"),
                date_issued=str(doc["date_issued"]) if doc.get("date_issued") else None,
                document_number=doc.get("document_number"),
                court_name=doc.get("court_name"),
                language=doc.get("language"),
                summary=_truncate(doc.get("summary"), 200),
                score=0.5,
                reason="Recently added document",
            )
            for doc in docs
        ]

    except Exception as e:
        logger.error(f"Error getting recent documents: {e}")
        return []


# ===== Helpers =====


def _truncate(text: str | None, max_len: int) -> str | None:
    """Truncate text to max length with ellipsis."""
    if not text:
        return None
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _content_reason(
    similarity: float, document_id: str | None, query: str | None
) -> str:
    """Generate a human-readable reason for the recommendation."""
    if document_id:
        if similarity > 0.8:
            return "Highly similar to the document you're viewing"
        if similarity > 0.6:
            return "Similar content to the document you're viewing"
        return "Related to the document you're viewing"
    if query:
        if similarity > 0.8:
            return "Closely matches your search"
        if similarity > 0.6:
            return "Related to your search"
        return "May be relevant to your search"
    return "Recommended for you"

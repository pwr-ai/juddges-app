"""
Research Assistant endpoint for AI-powered research guidance.

Provides intelligent research assistance by:
- Analyzing user's research context (searches, chats, interactions)
- Identifying research topics and knowledge gaps
- Suggesting next research steps
- Recommending related documents
- Saving and managing research contexts
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.auth_jwt import AuthenticatedUser, get_optional_user
from app.core.supabase import get_supabase_client
from app.documents_pkg import generate_embedding
from app.models import validate_id_format

router = APIRouter(prefix="/research-assistant", tags=["research-assistant"])

# OpenAI client for LLM analysis
_openai_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create the OpenAI client singleton."""
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI()
    return _openai_client


# ===== Request/Response Models =====


class ResearchTopic(BaseModel):
    """A topic identified in the user's research."""

    name: str = Field(description="Topic name")
    relevance: float = Field(ge=0.0, le=1.0, description="Relevance score (0-1)")
    document_count: int = Field(
        default=0, description="Number of documents related to this topic"
    )
    description: str | None = Field(default=None, description="Topic description")


class KnowledgeGap(BaseModel):
    """A gap identified in the user's research knowledge."""

    topic: str = Field(description="Gap topic or area")
    description: str = Field(description="Description of what's missing")
    severity: Literal["low", "medium", "high"] = Field(
        description="Gap importance level"
    )
    suggested_query: str | None = Field(
        default=None, description="Suggested search query to fill the gap"
    )


class ResearchStep(BaseModel):
    """A suggested next step in the research process."""

    title: str = Field(description="Step title")
    description: str = Field(description="Step description")
    action_type: Literal[
        "search", "read_document", "explore_topic", "compare_documents"
    ] = Field(description="Type of action to take")
    query: str | None = Field(
        default=None, description="Search query if action is 'search'"
    )
    document_ids: list[str] | None = Field(
        default=None, description="Document IDs if action involves specific documents"
    )
    priority: int = Field(default=0, description="Priority level (0=highest)")


class RelatedDocument(BaseModel):
    """A document related to the user's research."""

    document_id: str = Field(description="Document ID")
    title: str | None = Field(default=None, description="Document title")
    document_type: str | None = Field(default=None, description="Document type")
    relevance_score: float = Field(
        ge=0.0, le=1.0, description="Relevance to research context"
    )
    reason: str = Field(description="Why this document is relevant")


class AnalyzeResearchRequest(BaseModel):
    """Request for research context analysis."""

    query: str | None = Field(
        default=None, description="Optional query providing research context"
    )
    document_ids: list[str] | None = Field(
        default=None, description="Optional document IDs to include in analysis"
    )
    chat_id: str | None = Field(default=None, description="Optional chat ID to analyze")


class AnalyzeResearchResponse(BaseModel):
    """Response from research analysis."""

    topics: list[ResearchTopic] = Field(description="Identified research topics")
    gaps: list[KnowledgeGap] = Field(description="Identified knowledge gaps")
    next_steps: list[ResearchStep] = Field(description="Suggested next steps")
    related_documents: list[RelatedDocument] = Field(
        description="Related documents to explore"
    )
    coverage_score: float = Field(
        ge=0.0, le=1.0, description="Research coverage score (0-1)"
    )
    analysis_summary: str = Field(description="Summary of research analysis")


class QuickSuggestion(BaseModel):
    """Quick suggestions without full analysis."""

    related_documents: list[RelatedDocument] = Field(description="Related documents")
    next_steps: list[ResearchStep] = Field(description="Suggested next steps")
    trending_topics: list[str] = Field(
        description="Trending topics from user's history"
    )


class SavedResearchContext(BaseModel):
    """A saved research context."""

    id: str = Field(description="Context ID")
    user_id: str = Field(description="User ID")
    chat_id: str | None = Field(default=None, description="Associated chat ID")
    title: str | None = Field(default=None, description="Context title")
    analyzed_topics: list[ResearchTopic] = Field(description="Topics from analysis")
    identified_gaps: list[KnowledgeGap] = Field(description="Identified gaps")
    suggested_next_steps: list[ResearchStep] = Field(description="Suggested steps")
    related_document_ids: list[str] = Field(description="Related document IDs")
    coverage_score: float = Field(ge=0.0, le=1.0, description="Coverage score")
    status: str = Field(description="Context status")
    created_at: str = Field(description="Creation timestamp")
    updated_at: str = Field(description="Update timestamp")


class SaveResearchContextRequest(BaseModel):
    """Request to save a research context."""

    chat_id: str | None = Field(default=None, description="Associated chat ID")
    title: str | None = Field(default=None, description="Context title")
    analyzed_topics: list[dict] = Field(default_factory=list, description="Topics JSON")
    identified_gaps: list[dict] = Field(default_factory=list, description="Gaps JSON")
    suggested_next_steps: list[dict] = Field(
        default_factory=list, description="Steps JSON"
    )
    related_document_ids: list[str] = Field(
        default_factory=list, description="Related document IDs"
    )
    coverage_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Coverage score"
    )


# ===== Endpoints =====


@router.post(
    "/analyze",
    response_model=AnalyzeResearchResponse,
    summary="Analyze research context",
    description="Analyze user's research context to identify topics, gaps, and suggest next steps.",
)
async def analyze_research(
    request: AnalyzeResearchRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> AnalyzeResearchResponse:
    """Analyze user's research context using LLM to identify topics, gaps, and next steps."""
    user_id = current_user.id if current_user else None
    try:
        # Gather research context
        context_data = await _gather_research_context(
            user_id=user_id,
            query=request.query,
            document_ids=request.document_ids,
            chat_id=request.chat_id,
        )

        if not context_data.get("has_data"):
            # Return empty analysis if no context available
            return AnalyzeResearchResponse(
                topics=[],
                gaps=[],
                next_steps=[],
                related_documents=[],
                coverage_score=0.0,
                analysis_summary="No research context available for analysis.",
            )

        # Use LLM to analyze the context
        analysis = await _analyze_with_llm(context_data)

        # Find related documents via vector search
        related_docs = await _find_related_documents(
            context_data=context_data,
            limit=10,
        )

        return AnalyzeResearchResponse(
            topics=analysis.get("topics", []),
            gaps=analysis.get("gaps", []),
            next_steps=analysis.get("next_steps", []),
            related_documents=related_docs,
            coverage_score=analysis.get("coverage_score", 0.5),
            analysis_summary=analysis.get("summary", "Research analysis completed."),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing research context: {e}")
        raise HTTPException(status_code=500, detail="Error analyzing research context.")


@router.get(
    "/suggestions",
    response_model=QuickSuggestion,
    summary="Get quick research suggestions",
    description="Get lightweight suggestions without full LLM analysis.",
)
async def get_suggestions(
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
    query: str | None = Query(default=None, description="Optional query context"),
    document_id: str | None = Query(
        default=None, description="Optional document ID for similar documents"
    ),
    limit: int = Query(5, ge=1, le=20, description="Number of suggestions"),
) -> QuickSuggestion:
    """Get quick suggestions based on embeddings and user history (no LLM)."""
    user_id = current_user.id if current_user else None
    if document_id:
        try:
            validate_id_format(document_id, "document_id")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    try:
        # Find related documents
        related_docs = []

        if query or document_id:
            embedding = None

            if document_id:
                # Get embedding from document
                db = get_vector_db()
                doc_data = await db.get_document_by_id(document_id)
                if doc_data:
                    embedding = doc_data.get("embedding")
                    if not embedding:
                        text = (
                            doc_data.get("summary")
                            or doc_data.get("title")
                            or doc_data.get("full_text", "")[:2000]
                        )
                        if text:
                            embedding = await generate_embedding(text)

            if not embedding and query:
                embedding = await generate_embedding(query)

            if embedding:
                db = get_vector_db()
                similar = await db.search_by_vector(
                    query_embedding=embedding,
                    match_count=limit,
                    match_threshold=0.3,
                )

                for result in similar:
                    if document_id and result.get("document_id") == document_id:
                        continue

                    related_docs.append(
                        RelatedDocument(
                            document_id=result.get("document_id", ""),
                            title=result.get("title"),
                            document_type=result.get("document_type"),
                            relevance_score=round(result.get("similarity", 0.0), 3),
                            reason="Similar to your query"
                            if query
                            else "Similar to the document you're viewing",
                        )
                    )

        # Get trending topics from user history
        trending = await _get_trending_topics(user_id, limit=5)

        # Generate simple next steps
        next_steps = _generate_simple_next_steps(
            related_docs=related_docs,
            trending_topics=trending,
            query=query,
        )

        return QuickSuggestion(
            related_documents=related_docs[:limit],
            next_steps=next_steps[:limit],
            trending_topics=trending,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting suggestions: {e}")
        raise HTTPException(status_code=500, detail="Error getting suggestions.")


@router.get(
    "/contexts",
    response_model=list[SavedResearchContext],
    summary="List saved research contexts",
    description="List user's saved research contexts.",
)
async def list_research_contexts(
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
    limit: int = Query(10, ge=1, le=50, description="Number of contexts to return"),
    status: str = Query("active", description="Filter by status"),
) -> list[SavedResearchContext]:
    """List user's saved research contexts."""
    user_id = current_user.id if current_user else None
    if not user_id:
        return []

    try:
        supabase = get_supabase_client()
        if not supabase:
            logger.warning("Supabase client not available for listing contexts")
            return []

        query = (
            supabase.table("research_contexts")
            .select(
                "id, user_id, chat_id, title, analyzed_topics, identified_gaps, "
                "suggested_next_steps, related_document_ids, coverage_score, "
                "status, created_at, updated_at"
            )
            .eq("user_id", user_id)
        )

        if status:
            query = query.eq("status", status)

        response = query.order("created_at", desc=True).limit(limit).execute()

        contexts = response.data if response.data else []

        return [
            SavedResearchContext(
                id=ctx["id"],
                user_id=ctx["user_id"],
                chat_id=ctx.get("chat_id"),
                title=ctx.get("title"),
                analyzed_topics=ctx.get("analyzed_topics", []),
                identified_gaps=ctx.get("identified_gaps", []),
                suggested_next_steps=ctx.get("suggested_next_steps", []),
                related_document_ids=ctx.get("related_document_ids", []),
                coverage_score=ctx.get("coverage_score", 0.0),
                status=ctx.get("status", "active"),
                created_at=ctx["created_at"],
                updated_at=ctx["updated_at"],
            )
            for ctx in contexts
        ]

    except Exception as e:
        logger.error(f"Error listing research contexts: {e}")
        raise HTTPException(status_code=500, detail="Error listing research contexts.")


@router.post(
    "/contexts",
    response_model=SavedResearchContext,
    summary="Save research context",
    description="Save a research context for later reference.",
)
async def save_research_context(
    request: SaveResearchContextRequest,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> SavedResearchContext:
    """Save a research context. Requires authentication."""
    if not current_user:
        raise HTTPException(
            status_code=401, detail="Authentication required to save context."
        )
    user_id = current_user.id

    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Storage service unavailable.")

        context_data = {
            "user_id": user_id,
            "chat_id": request.chat_id,
            "title": request.title or "Untitled Research Context",
            "analyzed_topics": request.analyzed_topics,
            "identified_gaps": request.identified_gaps,
            "suggested_next_steps": request.suggested_next_steps,
            "related_document_ids": request.related_document_ids,
            "coverage_score": request.coverage_score,
            "status": "active",
        }

        response = supabase.table("research_contexts").insert(context_data).execute()

        if not response.data:
            raise HTTPException(
                status_code=500, detail="Failed to save research context."
            )

        saved = response.data[0]

        return SavedResearchContext(
            id=saved["id"],
            user_id=saved["user_id"],
            chat_id=saved.get("chat_id"),
            title=saved.get("title"),
            analyzed_topics=saved.get("analyzed_topics", []),
            identified_gaps=saved.get("identified_gaps", []),
            suggested_next_steps=saved.get("suggested_next_steps", []),
            related_document_ids=saved.get("related_document_ids", []),
            coverage_score=saved.get("coverage_score", 0.0),
            status=saved.get("status", "active"),
            created_at=saved["created_at"],
            updated_at=saved["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving research context: {e}")
        raise HTTPException(status_code=500, detail="Error saving research context.")


# ===== Internal Helper Functions =====


async def _gather_research_context(
    user_id: str | None,
    query: str | None,
    document_ids: list[str] | None,
    chat_id: str | None,
) -> dict:
    """Gather user's research context from various sources."""
    context = {
        "has_data": False,
        "recent_searches": [],
        "recent_messages": [],
        "viewed_documents": [],
        "provided_query": query,
        "provided_documents": document_ids or [],
        "chat_id": chat_id,
    }

    if not user_id:
        if query or document_ids:
            context["has_data"] = True
        return context

    supabase = get_supabase_client()
    if not supabase:
        return context

    try:
        # Get recent search queries
        search_response = (
            supabase.table("search_queries")
            .select("query, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        if search_response.data:
            context["recent_searches"] = [
                {"query": s["query"], "timestamp": s["created_at"]}
                for s in search_response.data
            ]
            context["has_data"] = True

        # Get recent chat messages if chat_id provided
        if chat_id:
            messages_response = (
                supabase.table("messages")
                .select("content, role, created_at")
                .eq("chat_id", chat_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )

            if messages_response.data:
                context["recent_messages"] = [
                    {
                        "content": m["content"],
                        "role": m["role"],
                        "timestamp": m["created_at"],
                    }
                    for m in messages_response.data
                ]
                context["has_data"] = True

        # Get recent document interactions
        interactions_response = (
            supabase.table("user_document_interactions")
            .select("document_id, interaction_type, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

        if interactions_response.data:
            # Group by document_id to avoid duplicates
            seen_docs = set()
            viewed_docs = []
            for interaction in interactions_response.data:
                doc_id = interaction["document_id"]
                if doc_id not in seen_docs:
                    seen_docs.add(doc_id)
                    viewed_docs.append(
                        {
                            "document_id": doc_id,
                            "interaction_type": interaction["interaction_type"],
                            "timestamp": interaction["created_at"],
                        }
                    )
            context["viewed_documents"] = viewed_docs[:10]
            if viewed_docs:
                context["has_data"] = True

    except Exception as e:
        logger.warning(f"Error gathering research context: {e}")

    return context


async def _analyze_with_llm(context_data: dict) -> dict:
    """Use OpenAI to analyze research context and identify topics, gaps, and next steps."""
    try:
        # Build a summary of the context for the LLM
        context_summary = _build_context_summary(context_data)

        prompt = f"""You are a legal research assistant analyzing a user's research context.

Based on the following research context:

{context_summary}

Analyze and provide:
1. **Topics**: Key research topics the user is exploring (name, relevance 0-1, description)
2. **Gaps**: Areas not yet explored or knowledge gaps (topic, description, severity: low/medium/high, suggested query)
3. **Next Steps**: Suggested actions to advance the research (title, description, action type: search/read_document/explore_topic/compare_documents, query if applicable, priority 0=highest)
4. **Coverage Score**: Overall research coverage (0-1, where 1 is comprehensive)
5. **Summary**: Brief analysis summary

Respond ONLY with valid JSON in this exact format:
{{
  "topics": [
    {{"name": "Topic Name", "relevance": 0.9, "document_count": 3, "description": "Topic description"}}
  ],
  "gaps": [
    {{"topic": "Gap topic", "description": "What's missing", "severity": "medium", "suggested_query": "suggested search"}}
  ],
  "next_steps": [
    {{"title": "Step title", "description": "What to do", "action_type": "search", "query": "search query", "priority": 0}}
  ],
  "coverage_score": 0.7,
  "summary": "Analysis summary"
}}"""

        client = get_openai_client()
        response = await client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a legal research analysis assistant. Respond only with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            # GPT-5 ignores temperature on reasoning models; max_tokens is
            # deprecated in favour of max_completion_tokens. Keep research
            # reasoning at default effort (this is the analysis step — we
            # actually want it to think).
            max_completion_tokens=4000,
        )

        content = response.choices[0].message.content
        if not content:
            raise ValueError("Empty response from LLM")

        # Parse JSON response
        import json

        try:
            return json.loads(content)
        except json.JSONDecodeError as json_err:
            logger.warning(
                f"Malformed JSON from LLM response: {json_err}. "
                f"Raw content: {content!r}"
            )
            return {
                "topics": [],
                "gaps": [],
                "next_steps": [],
                "coverage_score": 0.0,
                "summary": "Analysis unavailable due to an error.",
                "warning": "The AI returned an invalid response format. Please try again.",
            }

    except Exception as e:
        logger.error(f"Error analyzing with LLM: {e}")
        # Return empty analysis on error
        return {
            "topics": [],
            "gaps": [],
            "next_steps": [],
            "coverage_score": 0.0,
            "summary": "Analysis unavailable due to an error.",
            "error": f"LLM analysis failed: {type(e).__name__}",
        }


def _build_context_summary(context_data: dict) -> str:
    """Build a text summary of the research context for LLM analysis."""
    parts = []

    if context_data.get("provided_query"):
        parts.append(f"Current Query: {context_data['provided_query']}")

    if context_data.get("recent_searches"):
        searches = [s["query"] for s in context_data["recent_searches"][:5]]
        parts.append(f"Recent Searches: {', '.join(searches)}")

    if context_data.get("recent_messages"):
        messages = [
            f"{m['role']}: {m['content'][:100]}"
            for m in context_data["recent_messages"][:5]
        ]
        parts.append("Recent Chat Messages:\n" + "\n".join(messages))

    if context_data.get("viewed_documents"):
        doc_ids = [d["document_id"] for d in context_data["viewed_documents"][:5]]
        parts.append(f"Recently Viewed Documents: {', '.join(doc_ids)}")

    if context_data.get("provided_documents"):
        parts.append(
            f"Specified Documents: {', '.join(context_data['provided_documents'])}"
        )

    if not parts:
        return "No research context available."

    return "\n\n".join(parts)


async def _find_related_documents(
    context_data: dict,
    limit: int = 10,
) -> list[RelatedDocument]:
    """Find related documents via vector search based on context."""
    try:
        # Build a combined query from context
        query_parts = []

        if context_data.get("provided_query"):
            query_parts.append(context_data["provided_query"])

        if context_data.get("recent_searches"):
            query_parts.extend(
                [s["query"] for s in context_data["recent_searches"][:3]]
            )

        if not query_parts:
            return []

        combined_query = " ".join(query_parts)[:8000]
        embedding = await generate_embedding(combined_query)

        db = get_vector_db()
        similar = await db.search_by_vector(
            query_embedding=embedding,
            match_count=limit,
            match_threshold=0.3,
        )

        # Filter out already viewed documents
        viewed_ids = {
            d["document_id"] for d in context_data.get("viewed_documents", [])
        }

        results = []
        for result in similar:
            doc_id = result.get("document_id", "")
            if doc_id in viewed_ids:
                continue

            results.append(
                RelatedDocument(
                    document_id=doc_id,
                    title=result.get("title"),
                    document_type=result.get("document_type"),
                    relevance_score=round(result.get("similarity", 0.0), 3),
                    reason="Related to your research context",
                )
            )

            if len(results) >= limit:
                break

        return results

    except Exception as e:
        logger.error(f"Error finding related documents: {e}")
        return []


async def _get_trending_topics(user_id: str | None, limit: int = 5) -> list[str]:
    """Extract trending topics from user's search history."""
    if not user_id:
        return []

    try:
        supabase = get_supabase_client()
        if not supabase:
            return []

        response = (
            supabase.table("search_queries")
            .select("query")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

        if not response.data:
            return []

        # Simple keyword extraction (count word frequencies)
        import re
        from collections import Counter

        words = []
        for item in response.data:
            query = item.get("query", "")
            # Extract words (simple tokenization)
            tokens = re.findall(r"\b\w{4,}\b", query.lower())
            words.extend(tokens)

        # Get most common words
        common = Counter(words).most_common(limit)
        return [word for word, count in common]

    except Exception as e:
        logger.error(f"Error getting trending topics: {e}")
        return []


def _generate_simple_next_steps(
    related_docs: list[RelatedDocument],
    trending_topics: list[str],
    query: str | None,
) -> list[ResearchStep]:
    """Generate simple next steps without LLM."""
    steps = []

    # Suggest reading top related documents
    for i, doc in enumerate(related_docs[:3]):
        steps.append(
            ResearchStep(
                title=f"Read: {doc.title or doc.document_id}",
                description=f"Review this document: {doc.reason}",
                action_type="read_document",
                document_ids=[doc.document_id],
                priority=i,
            )
        )

    # Suggest exploring trending topics
    for i, topic in enumerate(trending_topics[:2]):
        steps.append(
            ResearchStep(
                title=f"Explore topic: {topic}",
                description=f"Search for more documents about '{topic}'",
                action_type="search",
                query=topic,
                priority=len(steps) + i,
            )
        )

    # Suggest broadening search if query provided
    if query and len(steps) < 5:
        steps.append(
            ResearchStep(
                title="Broaden your search",
                description="Try a broader search to discover related areas",
                action_type="search",
                query=query,
                priority=len(steps),
            )
        )

    return steps

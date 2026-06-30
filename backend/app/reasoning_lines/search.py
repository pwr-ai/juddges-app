"""Semantic search & cross-reference endpoints (#147 split)."""

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger

from app.rate_limiter import limiter

from .constants import REASONING_LINES_SEARCH_RATE_LIMIT
from .schemas import (
    ReasoningLineSearchRequest,
    ReasoningLineSearchResponse,
    ReasoningLineSearchResult,
    RelatedLinesResponse,
    RelatedReasoningLine,
)
from .similarity import (
    _cosine_similarity,
    _jaccard_similarity,
    _text_overlap_score,
    _tokenize,
)

router = APIRouter()


@router.post(
    "/search",
    response_model=ReasoningLineSearchResponse,
    summary="Semantic search for reasoning lines by natural language query",
)
@limiter.limit(REASONING_LINES_SEARCH_RATE_LIMIT)
async def search_reasoning_lines(
    request: Request,
    body: ReasoningLineSearchRequest,
) -> ReasoningLineSearchResponse:
    """
    Search reasoning lines using semantic similarity.

    Generates an embedding for the query and compares it against the
    avg_embedding of each active reasoning line using cosine similarity.
    Falls back to text-based matching if embedding generation fails.
    """
    db = get_vector_db()

    # Step 1: Fetch all active reasoning lines with their embeddings
    select_fields = (
        "id, label, legal_question, keywords, legal_bases, "
        "case_count, coherence_score, avg_embedding, status"
    )
    try:
        response = (
            db.client.table("reasoning_lines")
            .select(select_fields)
            .in_("status", ["active", "merged"])
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning lines for search: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    rows = response.data or []
    if not rows:
        return ReasoningLineSearchResponse(results=[], query=body.query, total_found=0)

    logger.info(
        f"Searching {len(rows)} reasoning lines for query: '{body.query[:80]}...'"
    )

    # Step 2: Try embedding-based search first, fall back to text-based
    use_embedding = False
    query_embedding: np.ndarray | None = None

    try:
        from app.judgments_pkg.utils import generate_embedding

        embedding_list = await generate_embedding(body.query)
        query_embedding = np.array(embedding_list, dtype=np.float32)
        use_embedding = True
        logger.debug("Using embedding-based semantic search")
    except Exception as e:
        logger.warning(
            f"Embedding generation failed, falling back to text-based search: {e}"
        )

    # Step 3: Score each reasoning line
    scored_results: list[tuple[float, dict]] = []
    query_tokens = _tokenize(body.query)

    for row in rows:
        similarity = 0.0

        if use_embedding and query_embedding is not None:
            # Embedding-based similarity
            row_embedding_raw = row.get("avg_embedding")
            if row_embedding_raw is not None:
                try:
                    row_embedding = np.array(row_embedding_raw, dtype=np.float32)
                    similarity = _cosine_similarity(query_embedding, row_embedding)
                except (ValueError, TypeError) as e:
                    logger.debug(f"Could not parse embedding for line {row['id']}: {e}")
                    # Fall through to text-based scoring for this row
                    similarity = 0.0

            # If embedding similarity is 0 (no embedding or parse failure),
            # supplement with text similarity
            if similarity == 0.0:
                line_tokens = _tokenize(
                    f"{row.get('legal_question', '')} "
                    f"{' '.join(row.get('keywords', []))}"
                )
                similarity = _text_overlap_score(query_tokens, line_tokens) * 0.5
        else:
            # Pure text-based fallback: combine legal_question and keywords
            line_text = (
                f"{row.get('legal_question', '')} "
                f"{' '.join(row.get('keywords', []))} "
                f"{' '.join(row.get('legal_bases', []))}"
            )
            line_tokens = _tokenize(line_text)
            similarity = _text_overlap_score(query_tokens, line_tokens)

        if similarity >= body.min_similarity:
            scored_results.append((similarity, row))

    # Step 4: Sort by similarity descending and take top N
    scored_results.sort(key=lambda x: x[0], reverse=True)
    top_results = scored_results[: body.limit]

    results = [
        ReasoningLineSearchResult(
            id=str(row["id"]),
            label=row["label"],
            legal_question=row["legal_question"],
            keywords=row.get("keywords") or [],
            legal_bases=row.get("legal_bases") or [],
            case_count=row.get("case_count", 0),
            coherence_score=row.get("coherence_score"),
            similarity=round(sim, 4),
        )
        for sim, row in top_results
    ]

    logger.info(
        f"Search returned {len(results)} results "
        f"(from {len(scored_results)} above threshold) "
        f"using {'embedding' if use_embedding else 'text'}-based similarity"
    )

    return ReasoningLineSearchResponse(
        results=results,
        query=body.query,
        total_found=len(scored_results),
    )


# ===== Milestone 6: Cross-Reference (Related Lines) Endpoint =====


@router.get(
    "/{line_id}/related",
    response_model=RelatedLinesResponse,
    summary="Find reasoning lines related to a given line",
)
@limiter.limit(REASONING_LINES_SEARCH_RATE_LIMIT)
async def get_related_reasoning_lines(
    request: Request,
    line_id: str,
    limit: int = Query(default=10, ge=1, le=50, description="Max related lines"),
) -> RelatedLinesResponse:
    """
    Find reasoning lines related to a given line based on a weighted combination
    of shared legal bases (Jaccard, weight 0.4), shared keywords (Jaccard,
    weight 0.2), and embedding similarity (cosine, weight 0.4).
    """
    db = get_vector_db()

    # Step 1: Fetch the target reasoning line
    select_fields = (
        "id, label, legal_question, keywords, legal_bases, "
        "case_count, coherence_score, avg_embedding, status"
    )
    try:
        target_resp = (
            db.client.table("reasoning_lines")
            .select(select_fields)
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    if not target_resp.data:
        raise HTTPException(status_code=404, detail="Reasoning line not found")

    target = target_resp.data[0]
    target_legal_bases = set(target.get("legal_bases") or [])
    target_keywords = set(target.get("keywords") or [])

    # Parse target embedding if available
    target_embedding: np.ndarray | None = None
    target_emb_raw = target.get("avg_embedding")
    if target_emb_raw is not None:
        try:
            target_embedding = np.array(target_emb_raw, dtype=np.float32)
        except (ValueError, TypeError) as e:
            logger.warning(f"Could not parse embedding for target line {line_id}: {e}")

    # Step 2: Fetch all other active reasoning lines
    try:
        others_resp = (
            db.client.table("reasoning_lines")
            .select(select_fields)
            .in_("status", ["active", "merged"])
            .neq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching other reasoning lines: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    others = others_resp.data or []
    if not others:
        return RelatedLinesResponse(line_id=line_id, related=[])

    logger.info(f"Computing relatedness of {len(others)} lines to line {line_id}")

    # Step 3: Score each candidate by weighted combination
    # Weights: legal_bases Jaccard = 0.4, keywords Jaccard = 0.2, embedding cosine = 0.4
    WEIGHT_LEGAL_BASES = 0.4
    WEIGHT_KEYWORDS = 0.2
    WEIGHT_EMBEDDING = 0.4

    scored: list[tuple[float, dict, list[str], list[str]]] = []

    for row in others:
        row_legal_bases = set(row.get("legal_bases") or [])
        row_keywords = set(row.get("keywords") or [])

        # Jaccard similarity for legal bases
        legal_bases_sim = _jaccard_similarity(target_legal_bases, row_legal_bases)

        # Jaccard similarity for keywords
        keywords_sim = _jaccard_similarity(target_keywords, row_keywords)

        # Embedding cosine similarity
        embedding_sim = 0.0
        if target_embedding is not None:
            row_emb_raw = row.get("avg_embedding")
            if row_emb_raw is not None:
                try:
                    row_embedding = np.array(row_emb_raw, dtype=np.float32)
                    embedding_sim = _cosine_similarity(target_embedding, row_embedding)
                except (ValueError, TypeError):
                    pass

        # Weighted combination
        combined_score = (
            WEIGHT_LEGAL_BASES * legal_bases_sim
            + WEIGHT_KEYWORDS * keywords_sim
            + WEIGHT_EMBEDDING * embedding_sim
        )

        shared_bases = sorted(target_legal_bases & row_legal_bases)
        shared_kws = sorted(target_keywords & row_keywords)

        scored.append((combined_score, row, shared_bases, shared_kws))

    # Step 4: Sort by relatedness descending and take top N
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]

    related = [
        RelatedReasoningLine(
            id=str(row["id"]),
            label=row["label"],
            legal_question=row["legal_question"],
            keywords=row.get("keywords") or [],
            case_count=row.get("case_count", 0),
            relatedness_score=round(score, 4),
            shared_legal_bases=shared_bases,
            shared_keywords=shared_kws,
        )
        for score, row, shared_bases, shared_kws in top
        if score > 0.0  # Exclude completely unrelated lines
    ]

    logger.info(f"Found {len(related)} related lines for line {line_id}")

    return RelatedLinesResponse(line_id=line_id, related=related)

"""Core search: validation, filter building, hybrid search, reranking, pagination."""

import asyncio
import os
import re
import time
from typing import Any, Literal

from fastapi import HTTPException
from juddges_search.models import LegalDocument
from loguru import logger

from app.config import settings
from app.models import (
    PaginationMetadata,
    SearchChunksRequest,
    SearchChunksResponse,
)
from app.utils import (
    validate_string_length,
)

from .conversion import _convert_judgment_to_legal_document
from .utils import (
    _ENGLISH_STOPWORDS,
    _POLISH_STOPWORDS,
    JUDGMENTS_EMBEDDING_DIMENSION,
    _detect_search_language,
    generate_embedding,
)

_INFERABLE_LIST_FILTER_FIELDS = (
    "jurisdictions",
    "court_names",
    "court_levels",
    "case_types",
    "decision_types",
    "outcomes",
    "keywords",
    "legal_topics",
    "cited_legislation",
)
_INFERABLE_DATE_FILTER_FIELDS = ("date_from", "date_to")


def _validate_search_query(query: str) -> None:
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        validate_string_length(query, 2000, "query")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _build_effective_filters(request: SearchChunksRequest) -> dict[str, Any]:
    return {
        "jurisdictions": request.jurisdictions,
        "court_names": request.court_names,
        "court_levels": request.court_levels,
        "case_types": request.case_types,
        "decision_types": request.decision_types,
        "outcomes": request.outcomes,
        "keywords": request.keywords,
        "legal_topics": request.legal_topics,
        "cited_legislation": request.cited_legislation,
        "date_from": request.date_from,
        "date_to": request.date_to,
    }


def _apply_inferred_filters(
    analysis: Any,
    effective_filters: dict[str, Any],
) -> dict[str, Any] | None:
    inferred_filters: dict[str, Any] = {}

    for key in _INFERABLE_LIST_FILTER_FIELDS:
        if effective_filters[key] is None:
            inferred_value = getattr(analysis, key, None)
            if inferred_value:
                effective_filters[key] = inferred_value
                inferred_filters[key] = inferred_value

    for key in _INFERABLE_DATE_FILTER_FIELDS:
        if not effective_filters[key]:
            inferred_value = getattr(analysis, key, None)
            if inferred_value:
                effective_filters[key] = inferred_value
                inferred_filters[key] = inferred_value

    return inferred_filters or None


async def _prepare_search_queries(
    request: SearchChunksRequest,
    query: str,
) -> tuple[
    str, str, str | None, dict[str, Any] | None, float, str | None, dict[str, Any]
]:
    semantic_query = query
    keyword_query = query
    enhanced_query_text: str | None = None
    inferred_filters: dict[str, Any] | None = None
    enhancement_time_ms = 0.0
    query_analysis_source: str | None = None
    effective_filters = _build_effective_filters(request)

    if request.mode != "thinking":
        return (
            semantic_query,
            keyword_query,
            enhanced_query_text,
            inferred_filters,
            enhancement_time_ms,
            query_analysis_source,
            effective_filters,
        )

    from app.query_analysis import analyze_query_heuristic, analyze_query_with_fallback

    enhancement_start = time.perf_counter()
    logger.info(f"Analyzing query in thinking mode: {query}")
    query_analysis_error: str | None = None
    # Fast path: when caller requests text-only search, avoid slow LLM analysis.
    if request.alpha <= 0.05:
        analysis = analyze_query_heuristic(query)
        query_analysis_source = "heuristic"
        query_analysis_error = "fast_path_text_only"
    else:
        # Adaptive timeout: longer queries need more LLM thinking.
        # GPT-5 with reasoning_effort=minimal has median ~2.5s but p95 reaches
        # 3-4s. 5000ms base keeps tail regressions rare without bloating UX;
        # 500+ char queries get 1.67x headroom for extra reasoning tokens.
        base_timeout_ms = int(os.getenv("QUERY_ANALYSIS_TIMEOUT_MS", "5000"))
        if len(query) >= 500 and base_timeout_ms > 0:
            timeout_ms = int(base_timeout_ms * 1.67)
        else:
            timeout_ms = base_timeout_ms
        try:
            if timeout_ms > 0:
                (
                    analysis,
                    query_analysis_source,
                    query_analysis_error,
                ) = await asyncio.wait_for(
                    analyze_query_with_fallback(query),
                    timeout=timeout_ms / 1000.0,
                )
            else:
                (
                    analysis,
                    query_analysis_source,
                    query_analysis_error,
                ) = await analyze_query_with_fallback(query)
        except TimeoutError:
            analysis = analyze_query_heuristic(query)
            query_analysis_source = "heuristic"
            query_analysis_error = (
                f"query_analysis_timeout_{timeout_ms}ms"
                if timeout_ms > 0
                else "query_analysis_timeout"
            )
    enhancement_time_ms = (time.perf_counter() - enhancement_start) * 1000

    if query_analysis_source == "heuristic":
        logger.warning(
            "LLM query analysis failed; using heuristic fallback",
            error=query_analysis_error,
        )

    semantic_query = (analysis.semantic_query or query).strip() or query
    keyword_query = (analysis.keyword_query or query).strip() or query
    enhanced_query_text = (
        semantic_query
        if semantic_query != query
        else (keyword_query if keyword_query != query else None)
    )
    inferred_filters = _apply_inferred_filters(analysis, effective_filters)

    logger.info(
        "Query analysis completed",
        semantic_query=semantic_query,
        keyword_query=keyword_query,
        source=query_analysis_source,
        inferred_filters=list((inferred_filters or {}).keys()),
    )
    return (
        semantic_query,
        keyword_query,
        enhanced_query_text,
        inferred_filters,
        enhancement_time_ms,
        query_analysis_source,
        effective_filters,
    )


def _route_effective_alpha(query: str, request_alpha: float) -> tuple[str, float, bool]:
    from app.query_analysis import classify_and_route_query

    query_type, recommended_alpha = classify_and_route_query(query)
    effective_alpha = request_alpha
    alpha_was_routed = False
    if request_alpha == 0.5 and query_type != "mixed":
        effective_alpha = recommended_alpha
        alpha_was_routed = True
        logger.info(
            f"Query classified as '{query_type}', adjusting alpha "
            f"{request_alpha} → {effective_alpha}"
        )
    return query_type, effective_alpha, alpha_was_routed


async def _generate_search_embedding(
    semantic_query: str,
    effective_alpha: float,
) -> tuple[list[float] | None, float, bool]:
    if effective_alpha <= 0:
        return None, 0.0, False

    from app.services.search_cache import get_cached_embedding, set_cached_embedding

    # Check cache first
    cached = await get_cached_embedding(semantic_query)
    if cached is not None and len(cached) == JUDGMENTS_EMBEDDING_DIMENSION:
        return cached, 0.0, False

    query_embedding: list[float] | None = None
    embedding_time_ms = 0.0
    vector_fallback = False
    try:
        embedding_start = time.perf_counter()
        query_embedding = await generate_embedding(semantic_query)
        if len(query_embedding) != JUDGMENTS_EMBEDDING_DIMENSION:
            logger.warning(
                f"Embedding dimension mismatch: expected {JUDGMENTS_EMBEDDING_DIMENSION}, "
                f"got {len(query_embedding)}. Falling back to text-only search."
            )
            query_embedding = None
            vector_fallback = True
        else:
            await set_cached_embedding(semantic_query, query_embedding)
        embedding_time_ms = (time.perf_counter() - embedding_start) * 1000
    except Exception as emb_err:
        logger.warning(
            f"Embedding generation failed, falling back to text-only search: {emb_err}"
        )
        query_embedding = None
        vector_fallback = True

    return query_embedding, embedding_time_ms, vector_fallback


async def _get_search_client():
    from app.core.supabase import get_async_supabase_client, get_supabase_client

    sync_client = get_supabase_client()
    if sync_client and os.getenv("PYTEST_CURRENT_TEST"):
        return sync_client

    async_client = await get_async_supabase_client()
    if async_client:
        return async_client
    if sync_client:
        return sync_client
    raise HTTPException(status_code=500, detail="Database client not initialized")


def _relax_keyword_for_conceptual(keyword_query: str, language: str) -> str:
    """For `conceptual` queries (≥4 content words), join tokens with " OR " so
    websearch_to_tsquery treats them as alternatives, not an AND.

    Without this, a 5-word Polish legal question like
    "odpowiedzialność solidarna wspólników spółki cywilnej" requires all five
    lemmata to co-occur in a doc → ~3 hits. With OR recall widens to 30-50
    while the vector side + RRF keep ranking tight.
    """
    tokens = re.findall(r"\w+", keyword_query.lower())
    if not tokens:
        return keyword_query
    stopwords = _POLISH_STOPWORDS if language == "polish" else _ENGLISH_STOPWORDS
    kept = [t for t in tokens if len(t) >= 3 and t not in stopwords]
    if len(kept) < 4:
        return keyword_query
    return " OR ".join(kept[:8])


def _build_search_rpc_params(
    query_embedding: list[float] | None,
    keyword_query: str,
    search_language: str,
    effective_filters: dict[str, Any],
    effective_alpha: float,
    limit: int,
    offset: int,
    query_type: str = "mixed",
    ef_search: int = 100,
) -> dict[str, Any]:
    if query_type == "conceptual":
        keyword_query = _relax_keyword_for_conceptual(keyword_query, search_language)

    # Constrain the vector branch by jurisdiction when the user asked for a
    # specific language. The SQL function's text branches already hard-filter
    # by jurisdiction via search_language, but vector_results only checks
    # filter_jurisdictions — without this mapping a query like
    # languages=["en"] leaked Polish documents into the semantic results.
    jurisdictions = effective_filters["jurisdictions"]
    if not jurisdictions:
        if search_language == "english":
            jurisdictions = ["UK"]
        elif search_language == "polish":
            jurisdictions = ["PL"]

    return {
        "query_embedding": query_embedding,
        "search_text": keyword_query if effective_alpha < 1.0 else None,
        "search_language": search_language,
        "filter_jurisdictions": jurisdictions,
        "filter_court_names": effective_filters["court_names"],
        "filter_court_levels": effective_filters["court_levels"],
        "filter_case_types": effective_filters["case_types"],
        "filter_decision_types": effective_filters["decision_types"],
        "filter_outcomes": effective_filters["outcomes"],
        "filter_keywords": effective_filters["keywords"],
        "filter_legal_topics": effective_filters["legal_topics"],
        "filter_cited_legislation": effective_filters["cited_legislation"],
        "filter_date_from": effective_filters["date_from"],
        "filter_date_to": effective_filters["date_to"],
        # Lowered from 0.5 — that threshold was dropping legitimate semantic
        # matches for niche English landmark queries (e.g. "Woollin", "Jogee")
        # whose 1024-dim cosine similarity sits in the 0.2-0.4 band.
        "similarity_threshold": 0.15,
        "hybrid_alpha": effective_alpha,
        "result_limit": limit,
        "result_offset": offset,
        "rrf_k": 60,
        "ef_search_value": ef_search,
    }


def _has_any_filters(filters: dict[str, Any]) -> bool:
    for value in filters.values():
        if value is None:
            continue
        if isinstance(value, list) and len(value) == 0:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return True
    return False


def _empty_filters() -> dict[str, Any]:
    return {
        "jurisdictions": None,
        "court_names": None,
        "court_levels": None,
        "case_types": None,
        "decision_types": None,
        "outcomes": None,
        "keywords": None,
        "legal_topics": None,
        "cited_legislation": None,
        "date_from": None,
        "date_to": None,
    }


def _build_relaxed_keyword_query(query: str, language: str) -> str | None:
    tokens = re.findall(r"\w+", query.lower())
    if not tokens:
        return None

    stopwords = _POLISH_STOPWORDS if language == "polish" else _ENGLISH_STOPWORDS
    kept = [t for t in tokens if len(t) >= 3 and t not in stopwords]
    if not kept:
        kept = [t for t in tokens if len(t) >= 3]

    if not kept:
        return None
    return " ".join(kept[:8])


def _build_generic_legal_query(language: str) -> str:
    if language == "polish":
        return "prawo wyrok sąd orzeczenie"
    return "law judgment court appeal"


async def _run_zero_result_fallbacks(
    *,
    request: SearchChunksRequest,
    query: str,
    semantic_query: str,
    keyword_query: str,
    search_language: str,
    effective_alpha: float,
    initial_query_embedding: list[float] | None,
    supabase: Any,
    limit: int,
    offset: int,
    vector_fallback: bool,
) -> tuple[list[dict[str, Any]], float, bool, str | None, str | None, bool]:
    """Retry zero-result thinking queries with progressively broader rewrites.

    All fallback attempts are fired in parallel via asyncio.gather; the first
    non-empty result (in priority order) wins.
    """
    explicit_filters = _build_effective_filters(request)
    attempts: list[tuple[str, str, str, float, dict[str, Any]]] = []
    seen: set[tuple[str, float, bool]] = set()

    def add_attempt(
        stage: str,
        semantic_text: str,
        keyword_text: str,
        alpha: float,
        filters: dict[str, Any],
    ) -> None:
        key = (keyword_text.strip().lower(), round(alpha, 2), _has_any_filters(filters))
        if not keyword_text.strip() or key in seen:
            return
        seen.add(key)
        attempts.append((stage, semantic_text, keyword_text, alpha, filters))

    add_attempt(
        "semantic_retry",
        semantic_query,
        semantic_query,
        effective_alpha,
        explicit_filters,
    )

    relaxed_query = _build_relaxed_keyword_query(keyword_query, search_language)
    if relaxed_query:
        add_attempt(
            "relaxed_terms",
            semantic_query,
            relaxed_query,
            effective_alpha,
            explicit_filters,
        )

    generic_query = _build_generic_legal_query(search_language)
    add_attempt(
        "generic_legal",
        semantic_query,
        generic_query,
        0.0,
        explicit_filters,
    )

    if _has_any_filters(explicit_filters):
        add_attempt(
            "generic_unfiltered",
            semantic_query,
            generic_query,
            0.0,
            _empty_filters(),
        )

    if not attempts:
        return [], 0.0, False, None, None, vector_fallback

    async def _run_single_fallback(
        stage: str,
        semantic_text: str,
        keyword_text: str,
        alpha: float,
        filters: dict[str, Any],
    ) -> tuple[str, list[dict[str, Any]], float, bool]:
        """Execute a single fallback attempt and return (stage, results, ms, emb_fallback)."""
        emb_ms = 0.0
        emb_fallback = False
        if alpha <= 0:
            fallback_embedding = None
        elif alpha == effective_alpha and semantic_text == semantic_query:
            fallback_embedding = initial_query_embedding
        else:
            fallback_embedding, emb_ms, emb_fallback = await _generate_search_embedding(
                semantic_text,
                alpha,
            )

        fallback_language = _detect_search_language(
            keyword_text,
            request.languages,
            filters["jurisdictions"],
        )
        fallback_params = _build_search_rpc_params(
            query_embedding=fallback_embedding,
            keyword_query=keyword_text,
            search_language=fallback_language,
            effective_filters=filters,
            effective_alpha=alpha,
            limit=limit,
            offset=offset,
        )
        fallback_results, fallback_search_ms = await _run_hybrid_search(
            supabase, fallback_params
        )
        total_ms = emb_ms + fallback_search_ms
        return stage, fallback_results, total_ms, emb_fallback

    wall_start = time.perf_counter()
    outcomes = await asyncio.gather(
        *[_run_single_fallback(*a) for a in attempts],
        return_exceptions=True,
    )
    total_fallback_ms = (time.perf_counter() - wall_start) * 1000

    winning_results: list[dict[str, Any]] = []
    winning_stage: str | None = None
    winning_keyword_text: str | None = None

    for idx, outcome in enumerate(outcomes):
        if isinstance(outcome, BaseException):
            stage_name = attempts[idx][0]
            logger.warning(
                "Zero-result fallback attempt raised an exception",
                stage=stage_name,
                error=str(outcome),
            )
            continue

        stage, fallback_results, _ms, emb_fallback = outcome
        vector_fallback = vector_fallback or emb_fallback

        logger.info(
            "Zero-result fallback attempt",
            stage=stage,
            alpha=attempts[idx][3],
            query=attempts[idx][2],
            result_count=len(fallback_results),
            filters_applied=_has_any_filters(attempts[idx][4]),
        )

        if fallback_results and not winning_results:
            winning_results = fallback_results
            winning_stage = stage
            winning_keyword_text = attempts[idx][2]

    if winning_results:
        return (
            winning_results,
            total_fallback_ms,
            True,
            winning_stage,
            winning_keyword_text,
            vector_fallback,
        )

    return [], total_fallback_ms, False, None, None, vector_fallback


async def _run_hybrid_search(
    supabase: Any,
    rpc_params: dict[str, Any],
) -> tuple[list[dict[str, Any]], float]:
    search_start = time.perf_counter()
    rpc_query = supabase.rpc("search_judgments_hybrid", rpc_params)
    execute = rpc_query.execute
    if asyncio.iscoroutinefunction(execute):
        response = await execute()
    else:
        response = await asyncio.to_thread(execute)
    search_time_ms = (time.perf_counter() - search_start) * 1000
    return response.data or [], search_time_ms


async def _get_estimated_total(
    supabase: Any,
    effective_filters: dict[str, Any],
) -> int | None:
    """Return COUNT(*) of judgments matching filters, or None on any error.

    This is a best-effort companion to ``search_judgments_hybrid``: it ignores
    text/vector relevance and just counts rows that satisfy the same filter
    predicates. The backend invokes it only on the first page; the value
    populates ``PaginationMetadata.estimated_total``. Failures are swallowed
    so a count blip never breaks search.
    """
    try:
        rpc_query = supabase.rpc(
            "count_judgments_filtered",
            {
                "filter_jurisdictions": effective_filters.get("jurisdictions"),
                "filter_court_names": effective_filters.get("court_names"),
                "filter_court_levels": effective_filters.get("court_levels"),
                "filter_case_types": effective_filters.get("case_types"),
                "filter_decision_types": effective_filters.get("decision_types"),
                "filter_outcomes": effective_filters.get("outcomes"),
                "filter_keywords": effective_filters.get("keywords"),
                "filter_legal_topics": effective_filters.get("legal_topics"),
                "filter_cited_legislation": effective_filters.get("cited_legislation"),
                "filter_date_from": effective_filters.get("date_from"),
                "filter_date_to": effective_filters.get("date_to"),
            },
        )
        execute = rpc_query.execute
        if asyncio.iscoroutinefunction(execute):
            response = await execute()
        else:
            response = await asyncio.to_thread(execute)

        # Supabase returns the scalar bigint as response.data — most clients
        # surface it as ``int`` directly, but defensive handling: it may also
        # arrive wrapped (e.g. ``[{"count_judgments_filtered": 1234}]``).
        data = response.data
        if data is None:
            return None
        if isinstance(data, int):
            return data
        if isinstance(data, list):
            if not data:
                return None
            first = data[0]
            if isinstance(first, dict):
                # Pick the only/first value, regardless of column key.
                value = next(iter(first.values()), None)
                return int(value) if value is not None else None
            if isinstance(first, int):
                return first
        if isinstance(data, dict):
            value = next(iter(data.values()), None)
            return int(value) if value is not None else None
        return None
    except Exception as exc:
        logger.warning(
            "count_judgments_filtered failed; estimated_total stays None: {}", exc
        )
        return None


async def _rerank_if_enabled(
    query: str,
    results: list[dict[str, Any]],
    top_k: int,
) -> tuple[list[dict[str, Any]], float]:
    if not results:
        return results, 0.0

    # Skip reranking when top results already have high confidence scores
    top_scores = [
        r.get("combined_score", 0.0) or 0.0
        for r in results[: settings.RERANK_SKIP_MIN_RESULTS]
    ]
    if len(top_scores) >= settings.RERANK_SKIP_MIN_RESULTS and all(
        s >= settings.RERANK_SKIP_THRESHOLD for s in top_scores
    ):
        logger.debug(
            f"Skipping rerank: top {len(top_scores)} scores "
            f"({[round(s, 3) for s in top_scores]}) all >= {settings.RERANK_SKIP_THRESHOLD}"
        )
        return results, 0.0

    from app.reranker import rerank_results

    rerank_start = time.perf_counter()
    reranked = await rerank_results(query=query, results=results, top_k=top_k)
    rerank_time_ms = (time.perf_counter() - rerank_start) * 1000
    return reranked, rerank_time_ms


def _build_search_result_payload(
    results: list[dict[str, Any]],
    result_view: Literal["card", "full"] = "full",
) -> tuple[list[dict[str, Any]], list[LegalDocument]]:
    chunks: list[dict[str, Any]] = []
    documents: list[LegalDocument] = []

    for result in results:
        chunks.append(
            {
                "document_id": str(result.get("id", "")),
                "chunk_id": 0,
                "chunk_text": result.get("chunk_text", "")
                or result.get("summary", "")
                or result.get("title", ""),
                "chunk_type": result.get("chunk_type", "summary"),
                "chunk_start_pos": result.get("chunk_start_pos", 0),
                "chunk_end_pos": result.get("chunk_end_pos", 0),
                "similarity": result.get("combined_score", 0.0),
                "metadata": result.get("chunk_metadata", {}),
                "vector_score": result.get("vector_score"),
                "text_score": result.get("text_score"),
                "combined_score": result.get("combined_score"),
            }
        )
        documents.append(
            _convert_judgment_to_legal_document(result, result_view=result_view)
        )

    return chunks, documents


def _build_search_timing_breakdown(
    mode: str,
    enhancement_time_ms: float,
    embedding_time_ms: float,
    vector_fallback: bool,
    search_time_ms: float,
    rerank_time_ms: float,
    fallback_time_ms: float,
    fallback_used: bool,
    fallback_stage: str | None,
    total_time_ms: float,
    query_type: str,
    effective_alpha: float,
    alpha_was_routed: bool,
) -> dict[str, Any]:
    return {
        "enhancement_ms": round(enhancement_time_ms, 2) if mode == "thinking" else 0,
        "embedding_ms": round(embedding_time_ms, 2),
        "vector_fallback": vector_fallback,
        "search_ms": round(search_time_ms, 2),
        "rerank_ms": round(rerank_time_ms, 2),
        "fallback_ms": round(fallback_time_ms, 2),
        "fallback_used": fallback_used,
        "fallback_stage": fallback_stage or "",
        "total_ms": round(total_time_ms, 2),
        "query_type": query_type,
        "effective_alpha": effective_alpha,
        "alpha_was_routed": alpha_was_routed,
    }


def _build_search_pagination(
    offset: int,
    limit: int,
    result_count: int,
    estimated_total: int | None = None,
) -> PaginationMetadata:
    has_more = result_count >= limit
    next_offset = offset + result_count if has_more else None
    return PaginationMetadata(
        offset=offset,
        limit=limit,
        loaded_count=result_count,
        estimated_total=estimated_total,
        has_more=has_more,
        next_offset=next_offset,
    )


async def run_document_search(request: SearchChunksRequest) -> SearchChunksResponse:
    """Run the hybrid document search pipeline.

    Extracted from the `POST /documents/search` route handler so the MCP
    tools call the same code path as HTTP. The route is a thin delegate;
    keep it that way - logic added here is available to both transports,
    logic added in the route is not.

    Facets-only fast path: when ``request.facets`` is provided and the query
    is blank, the pgvector pipeline is skipped and a thin Meilisearch
    ``/search`` call returns ``facetDistribution`` / ``facetStats``.
    """
    # ── Facets-only fast path ────────────────────────────────────────────
    # The tag-array autocomplete sends ``facets=[...]`` with an empty query
    # and ``limit_docs=0`` to fetch per-value counts. Bypass query validation
    # and the pgvector pipeline only when the request is *purely* asking for
    # facets — i.e. no real query text and no docs requested. A future caller
    # that wants both relevance-ranked docs AND facets must run the normal
    # pipeline so chunks aren't silently dropped.
    if request.facets and not (request.query or "").strip():
        from app.services.search import MeiliSearchService, SearchServiceError

        meili = MeiliSearchService.from_env()
        try:
            meili_response = await meili.search(
                query=request.query or "",
                limit=max(request.limit_docs, 0)
                if request.limit_docs is not None
                else 0,
                offset=request.offset or 0,
                facets=request.facets,
                facet_query=request.facet_query,
            )
        except SearchServiceError as exc:
            logger.warning(
                "facets_proxy_meili_failure — returning empty facets: {}", str(exc)
            )
            return SearchChunksResponse(
                chunks=[],
                total_chunks=0,
                unique_documents=0,
                facetDistribution=None,
                facetStats=None,
            )

        return SearchChunksResponse(
            chunks=[],
            total_chunks=0,
            unique_documents=0,
            query_time_ms=meili_response.get("processingTimeMs"),
            facetDistribution=meili_response.get("facetDistribution"),
            facetStats=meili_response.get("facetStats"),
        )

    start_time = time.perf_counter()
    query = request.query
    _validate_search_query(query)
    limit = request.limit_docs or 20
    offset = request.offset or 0

    # Full-response Redis cache (rabbit mode only). A hit here skips embedding,
    # RPC, rerank, payload build, estimated_total — the entire pipeline. Any
    # cache failure is swallowed so search continues to work without Redis.
    if request.mode != "thinking":
        try:
            from app.search_cache import get_cached_search

            # user_id=None: RLS is currently public-read so the cache key
            # stays request-only. Pass a stable user/role identifier here
            # once any non-public field or per-user filter ships.
            cached_response = await get_cached_search(request, user_id=None)
            if cached_response is not None:
                logger.debug(
                    "search_cache hit: query='{}...' offset={} limit={}",
                    query[:60],
                    offset,
                    limit,
                )
                return cached_response
        except Exception as cache_err:
            logger.warning("search_cache lookup failed (non-fatal): {}", cache_err)

    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category="search",
            message="documents.search called",
            data={"query_len": len(query), "limit": limit, "mode": request.mode},
            level="info",
        )
    except Exception as e:
        logger.warning(f"Failed to record telemetry: {e}")

    logger.info(
        f"Search request: query='{query[:100]}...', limit={limit}, "
        f"languages={request.languages}, "
        f"jurisdictions={request.jurisdictions}, case_types={request.case_types}"
    )

    try:
        (
            semantic_query,
            keyword_query,
            enhanced_query_text,
            inferred_filters,
            enhancement_time_ms,
            query_analysis_source,
            effective_filters,
        ) = await _prepare_search_queries(request, query)

        query_type, effective_alpha, alpha_was_routed = _route_effective_alpha(
            query, request.alpha
        )
        (
            query_embedding,
            embedding_time_ms,
            vector_fallback,
        ) = await _generate_search_embedding(semantic_query, effective_alpha)

        search_language = _detect_search_language(
            keyword_query, request.languages, effective_filters["jurisdictions"]
        )
        ef_search = 60 if offset > 0 else 100
        rpc_params = _build_search_rpc_params(
            query_embedding=query_embedding,
            keyword_query=keyword_query,
            search_language=search_language,
            effective_filters=effective_filters,
            effective_alpha=effective_alpha,
            limit=limit,
            offset=offset,
            query_type=query_type,
            ef_search=ef_search,
        )
        from app.services.search_cache import get_cached_results, set_cached_results

        # SECURITY: cache key omits user identity. Only safe while every
        # field returned here is public-read under RLS. See the SECURITY
        # CONTRACT in app/services/search_cache.py before adding any
        # per-user signal to this code path.
        cached_results = await get_cached_results(
            query=keyword_query,
            filters=effective_filters,
            alpha=effective_alpha,
            limit=limit,
            offset=offset,
        )
        if cached_results is not None:
            results = cached_results
            search_time_ms = 0.0
        else:
            supabase = await _get_search_client()
            results, search_time_ms = await _run_hybrid_search(supabase, rpc_params)
        fallback_time_ms = 0.0
        fallback_used = False
        fallback_stage: str | None = None

        if request.mode == "thinking" and not results:
            (
                results,
                fallback_time_ms,
                fallback_used,
                fallback_stage,
                fallback_query,
                vector_fallback,
            ) = await _run_zero_result_fallbacks(
                request=request,
                query=query,
                semantic_query=semantic_query,
                keyword_query=keyword_query,
                search_language=search_language,
                effective_alpha=effective_alpha,
                initial_query_embedding=query_embedding,
                supabase=supabase,
                limit=limit,
                offset=offset,
                vector_fallback=vector_fallback,
            )
            search_time_ms += fallback_time_ms
            if fallback_query:
                enhanced_query_text = fallback_query

        if cached_results is None and results:
            await set_cached_results(
                query=keyword_query,
                results=results,
                filters=effective_filters,
                alpha=effective_alpha,
                limit=limit,
                offset=offset,
            )

        results, rerank_time_ms = await _rerank_if_enabled(query, results, top_k=limit)
        chunks, documents = _build_search_result_payload(
            results, result_view=request.result_view
        )

        # First-page estimated_total. Only paid on offset==0 + include_count, so
        # load-more requests stay free. Errors return None and never block search.
        estimated_total: int | None = None
        if request.include_count and offset == 0:
            try:
                count_supabase = await _get_search_client()
                estimated_total = await _get_estimated_total(
                    count_supabase, effective_filters
                )
            except Exception as count_err:
                logger.warning(
                    "Skipping estimated_total (client/setup failed): {}", count_err
                )
                estimated_total = None

        total_time_ms = (time.perf_counter() - start_time) * 1000
        timing_breakdown = _build_search_timing_breakdown(
            mode=request.mode,
            enhancement_time_ms=enhancement_time_ms,
            embedding_time_ms=embedding_time_ms,
            vector_fallback=vector_fallback,
            search_time_ms=search_time_ms,
            rerank_time_ms=rerank_time_ms,
            fallback_time_ms=fallback_time_ms,
            fallback_used=fallback_used,
            fallback_stage=fallback_stage,
            total_time_ms=total_time_ms,
            query_type=query_type,
            effective_alpha=effective_alpha,
            alpha_was_routed=alpha_was_routed,
        )

        logger.info(
            f"Search completed: {len(results)} results in {total_time_ms:.0f}ms "
            f"(embedding: {embedding_time_ms:.0f}ms, search: {search_time_ms:.0f}ms)"
        )

        pagination = _build_search_pagination(
            offset, limit, len(results), estimated_total=estimated_total
        )

        try:
            from app.search_telemetry import record_search

            record_search(
                query=query,
                query_type=query_type,
                language=_detect_search_language(
                    keyword_query, request.languages, effective_filters["jurisdictions"]
                ),
                hits=len(chunks),
                chunks_preview=[
                    # Subscript, not attribute access: chunks are the plain
                    # dicts _build_search_result_payload builds. Reading
                    # c.document_id raised AttributeError, the except below
                    # swallowed it, and so every search with at least one hit
                    # emitted no trace at all. The dicts carry no "score" key
                    # either -- combined_score is what the ranking orders by.
                    {
                        "document_id": c["document_id"],
                        "score": c.get("combined_score"),
                    }
                    for c in chunks[:5]
                ],
                timing_breakdown=timing_breakdown.model_dump()
                if hasattr(timing_breakdown, "model_dump")
                else dict(timing_breakdown),
                effective_alpha=effective_alpha,
                alpha_was_routed=alpha_was_routed,
                vector_fallback=vector_fallback,
                fallback_used=fallback_used,
                thinking_mode=request.mode == "thinking",
            )
        except Exception as telem_err:
            logger.debug(f"Search telemetry skipped: {telem_err}")

        response = SearchChunksResponse(
            chunks=chunks,
            documents=documents,
            total_chunks=len(chunks),
            unique_documents=len(documents),
            query_time_ms=round(search_time_ms, 2),
            timing_breakdown=timing_breakdown,
            pagination=pagination,
            enhanced_query=enhanced_query_text if request.mode == "thinking" else None,
            query_enhancement_used=request.mode == "thinking",
            semantic_query=semantic_query if request.mode == "thinking" else None,
            keyword_query=keyword_query if request.mode == "thinking" else None,
            inferred_filters=inferred_filters if request.mode == "thinking" else None,
            query_analysis_source=query_analysis_source,
        )

        # Populate the full-response cache for subsequent identical requests.
        # Skipped for thinking mode (non-deterministic) and for any error path
        # (we never reach here on exception).
        if request.mode != "thinking":
            try:
                from app.search_cache import set_cached_search

                # user_id=None: see matching note on get_cached_search above.
                await set_cached_search(request, response, user_id=None)
            except Exception as cache_err:
                logger.warning("search_cache write failed (non-fatal): {}", cache_err)

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.opt(exception=True).error("Search error: {}", e)
        from app.sentry import capture_exception

        capture_exception(e, query=query[:200], limit=limit)
        raise HTTPException(status_code=500, detail=f"Search failed: {e!s}")

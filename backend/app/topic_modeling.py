"""
Topic modeling API endpoints for identifying emerging legal topics and trends.

Provides:
- LDA-style topic extraction from document corpus using TF-IDF and NMF
- Temporal trend analysis showing how topics evolve over time periods
- Topic keyword extraction and document-topic associations
- Trend direction detection (emerging, stable, declining)
"""

import math
import time
from collections import Counter
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request
from juddges_search.db.supabase_db import get_vector_db
from loguru import logger
from pydantic import BaseModel, Field

from app.rate_limiter import limiter

router = APIRouter(prefix="/topic-modeling", tags=["topic-modeling"])

# Per-endpoint rate limit for computationally expensive topic modeling
TOPIC_MODELING_RATE_LIMIT = "10/hour"


# ===== Models =====


class TopicModelingRequest(BaseModel):
    """Request to perform topic modeling on documents."""

    sample_size: int = Field(
        default=200,
        ge=20,
        le=1000,
        description="Number of documents to analyze",
    )
    num_topics: int = Field(
        default=8,
        ge=2,
        le=30,
        description="Number of topics to extract",
    )
    num_keywords: int = Field(
        default=8,
        ge=3,
        le=15,
        description="Number of keywords per topic",
    )
    time_periods: int = Field(
        default=6,
        ge=2,
        le=12,
        description="Number of time periods for trend analysis",
    )
    document_types: list[str] | None = Field(
        default=None, description="Optional filter by document types"
    )


class TopicKeyword(BaseModel):
    """A keyword within a topic with its weight."""

    word: str
    weight: float = Field(ge=0.0, description="Relevance weight of this keyword")


class TopicDocument(BaseModel):
    """A document associated with a topic."""

    document_id: str
    title: str | None = None
    document_type: str | None = None
    date_issued: str | None = None
    relevance: float = Field(
        ge=0.0, le=1.0, description="How relevant this document is to the topic"
    )


class TimePeriod(BaseModel):
    """Topic prevalence in a specific time period."""

    period_label: str = Field(
        description="Label for this time period (e.g., '2023-H1')"
    )
    start_date: str | None = None
    end_date: str | None = None
    document_count: int = Field(description="Documents in this period")
    topic_weight: float = Field(
        ge=0.0, description="Prevalence of this topic in this period"
    )


class Topic(BaseModel):
    """A discovered topic with keywords, documents, and temporal trends."""

    topic_id: int
    label: str = Field(description="Auto-generated topic label from top keywords")
    keywords: list[TopicKeyword] = Field(description="Top keywords for this topic")
    document_count: int = Field(description="Number of documents in this topic")
    coherence_score: float = Field(ge=0.0, le=1.0, description="Topic coherence score")
    trend: str = Field(description="Trend direction: emerging, stable, or declining")
    trend_slope: float = Field(description="Numerical slope of the trend line")
    time_series: list[TimePeriod] = Field(
        description="Topic prevalence across time periods"
    )
    top_documents: list[TopicDocument] = Field(
        description="Most representative documents for this topic"
    )


class TopicModelingStatistics(BaseModel):
    """Statistics about the topic modeling result."""

    total_documents: int
    documents_with_dates: int
    num_topics: int
    num_time_periods: int
    date_range_start: str | None = None
    date_range_end: str | None = None
    avg_topic_coherence: float
    processing_time_ms: float


class TopicModelingResponse(BaseModel):
    """Response from topic modeling analysis."""

    topics: list[Topic]
    statistics: TopicModelingStatistics


# ===== Utility Functions =====


# Polish + English stopwords (shared with clustering module)
STOPWORDS = {
    "w",
    "z",
    "na",
    "do",
    "i",
    "o",
    "nie",
    "się",
    "jest",
    "od",
    "za",
    "że",
    "to",
    "co",
    "po",
    "jak",
    "ale",
    "tym",
    "te",
    "ten",
    "ta",
    "tego",
    "tej",
    "przez",
    "dla",
    "ze",
    "pod",
    "nad",
    "przy",
    "the",
    "a",
    "an",
    "in",
    "of",
    "and",
    "is",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "or",
    "as",
    "be",
    "was",
    "are",
    "art",
    "ust",
    "pkt",
    "nr",
    "r",
    "dz",
    "poz",
    "lit",
    "oraz",
    "kan",
    "par",
    "jego",
    "ich",
    "który",
    "która",
    "które",
    "ktory",
    "ktora",
    "ktore",
    "bez",
    "jako",
    "też",
}


def _build_document_texts(documents: list[dict[str, Any]]) -> list[str]:
    """Build text representations from document metadata."""
    texts = []
    for doc in documents:
        parts = []
        if doc.get("title"):
            parts.append(doc["title"])
        if doc.get("summary"):
            parts.append(doc["summary"])
        if doc.get("keywords") and isinstance(doc["keywords"], list):
            parts.extend(doc["keywords"])
        texts.append(" ".join(parts).lower())
    return texts


def _build_tfidf_matrix(
    texts: list[str], max_features: int = 2000
) -> tuple[np.ndarray, list[str]]:
    """
    Build a TF-IDF matrix from document texts.

    Returns (tfidf_matrix, vocabulary) where tfidf_matrix is (n_docs, n_features).
    """
    # Tokenize and build vocabulary
    doc_tokens: list[list[str]] = []
    word_doc_count: Counter = Counter()

    for text in texts:
        tokens = [
            w for w in text.split() if len(w) > 2 and w not in STOPWORDS and w.isalpha()
        ]
        unique_tokens = set(tokens)
        for t in unique_tokens:
            word_doc_count[t] += 1
        doc_tokens.append(tokens)

    # Select top features by document frequency (filter very rare and very common)
    n_docs = len(texts)
    min_df = max(2, int(n_docs * 0.01))
    max_df = int(n_docs * 0.85)

    vocab_candidates = [
        (word, count)
        for word, count in word_doc_count.items()
        if min_df <= count <= max_df
    ]
    vocab_candidates.sort(key=lambda x: x[1], reverse=True)
    vocabulary = [w for w, _ in vocab_candidates[:max_features]]
    word_to_idx = {w: i for i, w in enumerate(vocabulary)}

    if not vocabulary:
        raise ValueError(
            "Insufficient textual content for topic analysis. "
            "No valid vocabulary words found after filtering."
        )

    # Build TF-IDF matrix
    n_features = len(vocabulary)
    tfidf = np.zeros((n_docs, n_features), dtype=np.float64)

    for doc_idx, tokens in enumerate(doc_tokens):
        token_counts = Counter(tokens)
        total = len(tokens) or 1
        for token, count in token_counts.items():
            if token in word_to_idx:
                col = word_to_idx[token]
                tf = count / total
                idf = np.log(n_docs / (word_doc_count[token] + 1)) + 1
                tfidf[doc_idx, col] = tf * idf

    # L2 normalize rows
    row_norms = np.linalg.norm(tfidf, axis=1, keepdims=True)
    row_norms[row_norms == 0] = 1.0
    tfidf /= row_norms

    return tfidf, vocabulary


def _nmf_decomposition(
    matrix: np.ndarray, n_components: int, max_iter: int = 200, tol: float = 1e-4
) -> tuple[np.ndarray, np.ndarray]:
    """
    Non-negative Matrix Factorization (NMF) using multiplicative updates.

    Decomposes V ≈ W * H where:
    - V is (n_docs, n_features)
    - W is (n_docs, n_components) - document-topic matrix
    - H is (n_components, n_features) - topic-term matrix

    Returns (W, H).
    """
    n, m = matrix.shape
    rng = np.random.RandomState(42)

    # Initialize with small random positive values
    W = rng.uniform(0.01, 0.1, (n, n_components)).astype(np.float64)
    H = rng.uniform(0.01, 0.1, (n_components, m)).astype(np.float64)

    eps = 1e-10  # Small value to avoid division by zero
    prev_cost = float("inf")

    for iteration in range(max_iter):
        # Update H: H <- H * (W^T V) / (W^T W H)
        numerator_h = W.T @ matrix
        denominator_h = W.T @ W @ H + eps
        H *= numerator_h / denominator_h

        # Update W: W <- W * (V H^T) / (W H H^T)
        numerator_w = matrix @ H.T
        denominator_w = W @ H @ H.T + eps
        W *= numerator_w / denominator_w

        # Check convergence every 10 iterations
        if iteration % 10 == 0:
            reconstruction = W @ H
            cost = np.sum((matrix - reconstruction) ** 2)
            if abs(prev_cost - cost) / (prev_cost + eps) < tol:
                break
            prev_cost = cost

    return W, H


def _compute_topic_coherence(
    topic_words: list[str], doc_tokens_sets: list[set[str]], top_n: int = 8
) -> float:
    """
    Compute topic coherence using pairwise word co-occurrence (UMass coherence).

    Higher values indicate more coherent topics.
    """
    words = topic_words[:top_n]
    if len(words) < 2:
        return 0.0

    n_docs = len(doc_tokens_sets)
    if n_docs == 0:
        return 0.0

    coherence_sum = 0.0
    pair_count = 0

    for i in range(1, len(words)):
        for j in range(i):
            # Count co-occurrences
            co_occur = sum(
                1
                for doc_set in doc_tokens_sets
                if words[i] in doc_set and words[j] in doc_set
            )
            d_j = sum(1 for doc_set in doc_tokens_sets if words[j] in doc_set)

            if d_j > 0:
                coherence_sum += np.log((co_occur + 1) / (d_j + 1))
                pair_count += 1

    return (coherence_sum / pair_count) if pair_count > 0 else 0.0


def _detect_trend(weights: list[float]) -> tuple[str, float]:
    """
    Detect trend direction from a time series of topic weights.

    Uses simple linear regression slope.
    Returns (trend_label, slope).
    """
    n = len(weights)
    if n < 2:
        return "stable", 0.0

    x = np.arange(n, dtype=np.float64)
    y = np.array(weights, dtype=np.float64)

    # Simple linear regression
    x_mean = x.mean()
    y_mean = y.mean()
    ss_xx = np.sum((x - x_mean) ** 2)
    if ss_xx == 0:
        return "stable", 0.0

    slope = np.sum((x - x_mean) * (y - y_mean)) / ss_xx

    # Normalize slope relative to mean weight, guarding against inf/NaN
    relative_slope = slope / y_mean if y_mean > 0 else 0.0
    if not math.isfinite(relative_slope):
        # Clamp to safe range when y_mean is near-zero and causes overflow
        relative_slope = 10.0 if slope > 0 else (-10.0 if slope < 0 else 0.0)

    # Classify trend
    if relative_slope > 0.1:
        return "emerging", round(float(slope), 6)
    if relative_slope < -0.1:
        return "declining", round(float(slope), 6)
    return "stable", round(float(slope), 6)


def _assign_time_periods(
    documents: list[dict[str, Any]], num_periods: int
) -> tuple[list[tuple[str, str, str]], dict[int, int]]:
    """
    Assign documents to time periods based on date_issued.

    Returns (period_definitions, doc_index_to_period_map).
    Period definitions are (label, start_date, end_date) tuples.
    """
    # Extract valid dates
    dated_docs: list[tuple[int, str]] = []
    for idx, doc in enumerate(documents):
        date_str = doc.get("date_issued")
        if date_str:
            try:
                date_val = str(date_str)[:10]
                if len(date_val) >= 4:
                    dated_docs.append((idx, date_val))
            except (ValueError, TypeError):
                pass

    if not dated_docs:
        return [], {}

    # Sort by date
    dated_docs.sort(key=lambda x: x[1])
    dates = [d[1] for d in dated_docs]

    min_date = dates[0]
    max_date = dates[-1]

    # Create equal-sized time periods
    min_year = int(min_date[:4])
    max_year = int(max_date[:4])

    if min_year == max_year:
        # All in same year - split by months
        periods = []
        months_per_period = max(1, 12 // num_periods)
        for i in range(num_periods):
            start_month = i * months_per_period + 1
            end_month = min((i + 1) * months_per_period, 12)
            label = f"{min_year}-M{start_month:02d}-M{end_month:02d}"
            start = f"{min_year}-{start_month:02d}-01"
            end = f"{min_year}-{end_month:02d}-28"
            periods.append((label, start, end))
    else:
        # Split years into periods
        total_years = max_year - min_year + 1
        years_per_period = max(1, total_years // num_periods)

        periods = []
        current_year = min_year
        for i in range(num_periods):
            start_year = current_year
            end_year = min(current_year + years_per_period - 1, max_year)
            if i == num_periods - 1:
                end_year = max_year

            if start_year == end_year:
                label = str(start_year)
            else:
                label = f"{start_year}-{end_year}"

            periods.append((label, f"{start_year}-01-01", f"{end_year}-12-31"))
            current_year = end_year + 1
            if current_year > max_year:
                break

    # Map documents to periods
    doc_to_period: dict[int, int] = {}
    for doc_idx, date_str in dated_docs:
        for period_idx, (_, start, end) in enumerate(periods):
            if start <= date_str <= end:
                doc_to_period[doc_idx] = period_idx
                break

    return periods, doc_to_period


async def _fetch_documents_for_topic_modeling(
    db: Any, request: TopicModelingRequest
) -> list[dict[str, Any]]:
    """Fetch documents for topic modeling with optional document type filter."""
    select_fields = "document_id, title, document_type, date_issued, summary, keywords"
    try:
        query = db.client.table("legal_documents").select(select_fields)
        if request.document_types:
            query = query.in_("document_type", request.document_types)
        response = query.limit(request.sample_size).execute()
    except Exception as e:
        logger.error(f"Error fetching documents for topic modeling: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch documents from database",
        )
    return response.data or []


def _build_doc_token_sets(texts: list[str]) -> list[set[str]]:
    """Build token sets for coherence calculation."""
    return [
        {
            word
            for word in text.split()
            if len(word) > 2 and word not in STOPWORDS and word.isalpha()
        }
        for text in texts
    ]


def _extract_topic_keywords(
    topic_weights: np.ndarray, vocabulary: list[str], num_keywords: int
) -> tuple[list[TopicKeyword], list[str]]:
    """Extract top weighted keywords and plain word list for a topic."""
    top_word_indices = np.argsort(topic_weights)[::-1][:num_keywords]
    keywords: list[TopicKeyword] = []
    topic_words: list[str] = []

    for word_idx in top_word_indices:
        if word_idx >= len(vocabulary):
            continue
        word = vocabulary[word_idx]
        weight = float(topic_weights[word_idx])
        if weight <= 0:
            continue
        keywords.append(TopicKeyword(word=word, weight=round(weight, 4)))
        topic_words.append(word)

    return keywords, topic_words


def _build_top_documents_for_topic(
    docs: list[dict[str, Any]],
    doc_relevances: np.ndarray,
    max_docs_per_topic: int = 10,
) -> tuple[list[TopicDocument], int]:
    """Build top representative documents and topic document count."""
    top_doc_indices = np.argsort(doc_relevances)[::-1][:max_docs_per_topic]
    max_relevance = doc_relevances.max() if doc_relevances.max() > 0 else 1.0

    top_documents: list[TopicDocument] = []
    for doc_idx in top_doc_indices:
        doc = docs[doc_idx]
        relevance = float(doc_relevances[doc_idx]) / max_relevance
        if relevance <= 0.05:
            continue
        top_documents.append(
            TopicDocument(
                document_id=doc["document_id"],
                title=doc.get("title"),
                document_type=doc.get("document_type"),
                date_issued=(
                    str(doc["date_issued"]) if doc.get("date_issued") else None
                ),
                relevance=round(relevance, 4),
            )
        )

    doc_count = sum(
        1 for relevance in doc_relevances if relevance > 0.05 * max_relevance
    )
    return top_documents, doc_count


def _build_topic_time_series(
    periods: list[tuple[str, str, str]],
    doc_to_period: dict[int, int],
    doc_relevances: np.ndarray,
) -> tuple[list[TimePeriod], list[float]]:
    """Build time-series prevalence for a topic."""
    if not periods:
        return [], []

    time_series: list[TimePeriod] = []
    period_weights: list[float] = []

    for period_idx, (period_label, period_start, period_end) in enumerate(periods):
        period_doc_indices = [
            idx
            for idx, assigned_period in doc_to_period.items()
            if assigned_period == period_idx
        ]
        period_doc_count = len(period_doc_indices)
        if period_doc_count > 0:
            topic_weight = float(
                np.mean([doc_relevances[idx] for idx in period_doc_indices])
            )
        else:
            topic_weight = 0.0

        period_weights.append(topic_weight)
        time_series.append(
            TimePeriod(
                period_label=period_label,
                start_date=period_start,
                end_date=period_end,
                document_count=period_doc_count,
                topic_weight=round(topic_weight, 4),
            )
        )

    return time_series, period_weights


def _build_topics(
    docs: list[dict[str, Any]],
    request: TopicModelingRequest,
    num_topics: int,
    W: np.ndarray,
    H: np.ndarray,
    vocabulary: list[str],
    periods: list[tuple[str, str, str]],
    doc_to_period: dict[int, int],
    doc_token_sets: list[set[str]],
) -> list[Topic]:
    """Build topic response objects from decomposition matrices."""
    topics: list[Topic] = []

    for topic_idx in range(num_topics):
        topic_weights = H[topic_idx]
        keywords, topic_words = _extract_topic_keywords(
            topic_weights=topic_weights,
            vocabulary=vocabulary,
            num_keywords=request.num_keywords,
        )
        if not keywords:
            continue

        doc_relevances = W[:, topic_idx]
        top_documents, doc_count = _build_top_documents_for_topic(docs, doc_relevances)
        time_series, period_weights = _build_topic_time_series(
            periods=periods,
            doc_to_period=doc_to_period,
            doc_relevances=doc_relevances,
        )

        coherence = _compute_topic_coherence(topic_words, doc_token_sets)
        coherence_normalized = max(0.0, min(1.0, (coherence + 10) / 10))
        trend_label, trend_slope = _detect_trend(period_weights)
        label = " / ".join(keyword.word for keyword in keywords[:3])

        topics.append(
            Topic(
                topic_id=topic_idx,
                label=label,
                keywords=keywords,
                document_count=doc_count,
                coherence_score=round(coherence_normalized, 4),
                trend=trend_label,
                trend_slope=trend_slope,
                time_series=time_series,
                top_documents=top_documents,
            )
        )

    topics.sort(key=lambda topic: topic.document_count, reverse=True)
    return topics


# ===== Endpoints =====


@router.post(
    "/analyze",
    response_model=TopicModelingResponse,
    summary="Identify emerging legal topics and trends",
)
@limiter.limit(TOPIC_MODELING_RATE_LIMIT)
async def analyze_topics(
    http_request: Request, request: TopicModelingRequest
) -> TopicModelingResponse:
    """
    Perform topic modeling on the document corpus.

    Uses NMF (Non-negative Matrix Factorization) on TF-IDF features to discover
    latent topics. Tracks topic prevalence across time periods to identify
    emerging, stable, and declining legal trends.
    """
    start_time = time.perf_counter()
    db = get_vector_db()
    docs = await _fetch_documents_for_topic_modeling(db, request)

    if len(docs) < request.num_topics:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough documents ({len(docs)}) for {request.num_topics} topics. "
            f"Need at least {request.num_topics}.",
        )

    # Build text representations and TF-IDF matrix
    texts = _build_document_texts(docs)
    tfidf_matrix, vocabulary = _build_tfidf_matrix(texts)

    if len(vocabulary) < 2:
        raise HTTPException(
            status_code=400,
            detail="Not enough textual content in documents for topic modeling.",
        )

    # NMF topic decomposition
    num_topics = min(request.num_topics, len(docs) - 1, len(vocabulary) - 1)
    W, H = _nmf_decomposition(tfidf_matrix, num_topics)

    # Assign time periods
    periods, doc_to_period = _assign_time_periods(docs, request.time_periods)

    doc_token_sets = _build_doc_token_sets(texts)
    topics = _build_topics(
        docs=docs,
        request=request,
        num_topics=num_topics,
        W=W,
        H=H,
        vocabulary=vocabulary,
        periods=periods,
        doc_to_period=doc_to_period,
        doc_token_sets=doc_token_sets,
    )

    # Compute statistics
    processing_time_ms = (time.perf_counter() - start_time) * 1000
    docs_with_dates = len(doc_to_period)

    statistics = TopicModelingStatistics(
        total_documents=len(docs),
        documents_with_dates=docs_with_dates,
        num_topics=len(topics),
        num_time_periods=len(periods),
        date_range_start=periods[0][1] if periods else None,
        date_range_end=periods[-1][2] if periods else None,
        avg_topic_coherence=round(
            float(np.mean([t.coherence_score for t in topics])), 4
        )
        if topics
        else 0.0,
        processing_time_ms=round(processing_time_ms, 2),
    )

    return TopicModelingResponse(
        topics=topics,
        statistics=statistics,
    )


@router.get(
    "/trending",
    response_model=TopicModelingResponse,
    summary="Quick trending topics analysis",
)
@limiter.limit(TOPIC_MODELING_RATE_LIMIT)
async def get_trending_topics(
    http_request: Request,
    num_topics: int = Query(default=5, ge=2, le=15, description="Number of topics"),
    sample_size: int = Query(
        default=200, ge=20, le=500, description="Documents to analyze"
    ),
) -> TopicModelingResponse:
    """
    Quick endpoint to get trending topics with default settings.

    Convenience endpoint that uses sensible defaults for quick analysis.
    """
    request = TopicModelingRequest(
        sample_size=sample_size,
        num_topics=num_topics,
        num_keywords=6,
        time_periods=6,
    )
    return await analyze_topics(request)

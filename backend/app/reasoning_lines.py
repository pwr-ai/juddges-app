"""
Legal Question Cluster Discovery API endpoints (Reasoning Line Tracker - Milestone 1).
CRUD persistence endpoints (Reasoning Line Tracker - Milestone 2).
Temporal Outcome Timeline endpoints (Reasoning Line Tracker - Milestone 3).
Language Drift Detection endpoints (Reasoning Line Tracker - Milestone 5).
Semantic Search & Cross-Reference endpoints (Reasoning Line Tracker - Milestone 6).

Discovers clusters of judgments addressing the same legal question by combining
embedding similarity with shared legal bases. Uses K-Means clustering on judgment
embeddings, then enriches each cluster with shared cited_legislation, coherence
scores, and PCA-based 2D visualization coordinates.

Milestone 2 adds endpoints to persist, list, retrieve, and soft-delete
reasoning lines and their judgment members.

Milestone 3 adds LLM-based outcome classification for member judgments and
temporal outcome timeline with trend detection for visualization.

Milestone 5 adds language drift detection within a reasoning line by analyzing
how the embedding centroid shifts across rolling time windows, identifying
semantic drift peaks and tracking entering/exiting keywords.
"""

import time
import json
import uuid
from collections import Counter
from datetime import UTC, datetime
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.llms import get_default_llm
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from loguru import logger
from pydantic import BaseModel, Field

from app.clustering import _compute_pca_2d, _extract_keywords_tfidf, _kmeans
from app.rate_limiter import limiter

router = APIRouter(prefix="/reasoning-lines", tags=["reasoning-lines"])

# Computationally expensive — stricter rate limit
REASONING_LINES_RATE_LIMIT = "10/hour"
REASONING_LINES_READ_RATE_LIMIT = "30/hour"
# LLM-based classification — most expensive, strictest limit
REASONING_LINES_LLM_RATE_LIMIT = "5/hour"


# ===== Request / Response Models =====


class ReasoningLineDiscoveryRequest(BaseModel):
    """Request to discover clusters of judgments addressing the same legal question."""

    sample_size: int = Field(
        default=200,
        ge=20,
        le=500,
        description="Number of judgments to sample for clustering",
    )
    num_clusters: int = Field(
        default=8,
        ge=2,
        le=20,
        description="Number of clusters to discover",
    )
    legal_domain_filter: str | None = Field(
        default=None,
        description="Optional filter: only include judgments whose deep_legal_domains contain this value",
    )
    min_shared_legal_bases: int = Field(
        default=1,
        ge=0,
        description="Minimum number of shared cited_legislation entries to consider judgments related",
    )


class DiscoveredCase(BaseModel):
    """A judgment within a discovered reasoning-line cluster."""

    judgment_id: str
    signature: str | None = None
    title: str | None = None
    court_name: str | None = None
    decision_date: str | None = None
    similarity_to_centroid: float = Field(
        ge=0.0, le=1.0, description="Cosine similarity to the cluster centroid"
    )
    cited_legislation: list[str] = Field(default_factory=list)


class DiscoveredCluster(BaseModel):
    """A single reasoning-line cluster of judgments."""

    cluster_id: int
    label: str = Field(description="Auto-generated label from top keywords")
    keywords: list[str] = Field(description="Top 5 TF-IDF keywords")
    legal_bases: list[str] = Field(
        description="Most common cited_legislation entries in this cluster"
    )
    case_count: int
    coherence_score: float = Field(
        ge=0.0, le=1.0, description="Average intra-cluster cosine similarity"
    )
    date_range: dict[str, str | None] = Field(
        description="Earliest and latest decision_date in this cluster"
    )
    top_cases: list[DiscoveredCase] = Field(
        description="Up to 10 representative cases sorted by similarity to centroid"
    )


class VisualizationNode(BaseModel):
    """Node in the cluster visualization graph."""

    id: str
    title: str
    x: float
    y: float
    cluster_id: int


class VisualizationEdge(BaseModel):
    """Edge between similar judgments in the visualization graph."""

    source: str
    target: str
    similarity: float = Field(ge=0.0, le=1.0)


class ReasoningLineDiscoveryResponse(BaseModel):
    """Response from reasoning-line cluster discovery."""

    clusters: list[DiscoveredCluster]
    statistics: dict[str, Any]
    visualization: dict[str, Any]


# ===== Milestone 2: Persistence Models =====


class ReasoningLineSummary(BaseModel):
    """Summary of a saved reasoning line for list view."""

    id: str
    label: str
    legal_question: str
    keywords: list[str]
    legal_bases: list[str]
    status: str  # active, merged, superseded, dormant
    case_count: int
    coherence_score: float | None
    date_range_start: str | None
    date_range_end: str | None
    created_at: str


class ReasoningLineMember(BaseModel):
    """A judgment assigned to a reasoning line."""

    judgment_id: str
    signature: str | None = None
    title: str | None = None
    court_name: str | None = None
    decision_date: str | None = None
    position_in_line: int
    similarity_to_centroid: float
    reasoning_pattern: str | None = None
    outcome_direction: str | None = None


class ReasoningLineDetail(BaseModel):
    """Full detail of a reasoning line with members."""

    id: str
    label: str
    legal_question: str
    keywords: list[str]
    legal_bases: list[str]
    status: str
    case_count: int
    coherence_score: float | None
    date_range_start: str | None
    date_range_end: str | None
    created_at: str
    updated_at: str
    members: list[ReasoningLineMember]


class CreateReasoningLineRequest(BaseModel):
    """Request to save a discovered cluster as a reasoning line."""

    label: str = Field(description="Label for the reasoning line")
    legal_question: str = Field(description="The legal question this line addresses")
    keywords: list[str] = Field(default_factory=list)
    legal_bases: list[str] = Field(default_factory=list)
    judgment_ids: list[str] = Field(
        description="List of judgment IDs to assign as members"
    )
    coherence_score: float | None = None


# ===== Milestone 3: Temporal Outcome Timeline Models =====


class OutcomeClassificationResult(BaseModel):
    """Result of LLM-based outcome classification for a reasoning line's members."""

    classified: int = Field(description="Number of members successfully classified")
    skipped: int = Field(description="Number of members skipped (already classified)")
    errors: int = Field(description="Number of members where classification failed")


class TimelinePoint(BaseModel):
    """A single time-bucketed point in the outcome timeline."""

    period_label: str = Field(
        description="Human-readable period label, e.g. '2020-Q1' or '2020'"
    )
    start_date: str
    end_date: str
    total: int
    for_count: int
    against_count: int
    mixed_count: int
    procedural_count: int
    unclassified_count: int
    for_ratio: float = Field(
        ge=0.0, le=1.0, description="Ratio of 'for' outcomes to total classified"
    )


class ReasoningLineTimeline(BaseModel):
    """Temporal outcome distribution for a reasoning line."""

    line_id: str
    legal_question: str
    points: list[TimelinePoint]
    trend: str = Field(
        description=(
            "Overall trend: emerging_consensus, stable_split, "
            "shifting, insufficient_data"
        )
    )
    trend_slope: float = Field(
        description="Linear regression slope of for_ratio over time"
    )
    total_classified: int
    total_unclassified: int


# ===== Helpers =====


def _extract_legal_bases(
    documents: list[dict[str, Any]],
    labels: np.ndarray,
    num_clusters: int,
    top_n: int = 5,
) -> dict[int, list[str]]:
    """
    Extract the most common cited_legislation entries per cluster.

    Counts legislation references across all cluster members and returns
    the top-N most frequent entries for each cluster.
    """
    result: dict[int, list[str]] = {}
    for cluster_id in range(num_clusters):
        legislation_counter: Counter = Counter()
        for doc, label in zip(documents, labels, strict=False):
            if label != cluster_id:
                continue
            cited = doc.get("cited_legislation")
            if cited and isinstance(cited, list):
                legislation_counter.update(cited)

        result[cluster_id] = [
            entry for entry, _ in legislation_counter.most_common(top_n)
        ]
    return result


def _compute_date_range(
    documents: list[dict[str, Any]],
    indices: np.ndarray,
) -> dict[str, str | None]:
    """Compute earliest and latest decision_date for the given document indices."""
    dates: list[str] = []
    for idx in indices:
        date_val = documents[idx].get("decision_date")
        if date_val:
            dates.append(str(date_val))

    if not dates:
        return {"start": None, "end": None}

    dates.sort()
    return {"start": dates[0], "end": dates[-1]}


def _compute_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors, returning 0.0 for zero-norm vectors."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.clip(np.dot(vec_a, vec_b) / (norm_a * norm_b), 0.0, 1.0))


# ===== Milestone 3: Outcome Classification Helpers =====

# Maximum characters of judgment text to send to the LLM for outcome classification
_OUTCOME_TEXT_MAX_CHARS = 8000

# Maximum members to classify in a single analyze-outcomes request
_OUTCOME_MAX_MEMBERS_PER_CALL = 50

OUTCOME_CLASSIFICATION_SYSTEM_PROMPT = (
    "You are a legal analyst specializing in court judgment outcome classification. "
    "You must respond with valid JSON matching the requested schema."
)

OUTCOME_CLASSIFICATION_USER_PROMPT = """You are a legal analyst. Given a legal question and a \
court judgment, classify the judgment's outcome.

Legal question: {legal_question}

Judgment text (excerpt): {text}

Classify the outcome as one of:
- "for": The court ruled in favor of the position implied by the legal question
- "against": The court ruled against the position
- "mixed": The court's ruling was partially favorable, partially unfavorable
- "procedural": The case was decided on procedural grounds without addressing the \
substantive question

Return JSON: {{"outcome_direction": "for|against|mixed|procedural", \
"reasoning": "brief explanation"}}"""


def _detect_timeline_trend(for_ratios: list[float]) -> tuple[str, float]:
    """
    Detect the overall trend of outcome direction over time using linear regression.

    Interprets the slope and variance of for_ratio across time periods to classify
    the trend as one of: emerging_consensus, stable_split, shifting, insufficient_data.

    Returns (trend_label, slope).
    """
    n = len(for_ratios)
    if n < 3:
        return "insufficient_data", 0.0

    x = np.arange(n, dtype=np.float64)
    y = np.array(for_ratios, dtype=np.float64)

    # Simple linear regression for slope
    x_mean = x.mean()
    y_mean = y.mean()
    ss_xx = float(np.sum((x - x_mean) ** 2))
    if ss_xx == 0:
        return "stable_split", 0.0

    slope = float(np.sum((x - x_mean) * (y - y_mean)) / ss_xx)

    # Compute variance of for_ratio to distinguish consensus from split
    variance = float(np.var(y))

    # Classify trend based on slope magnitude and latest values
    abs_slope = abs(slope)

    if abs_slope > 0.05:
        # Significant directional change over time
        return "shifting", round(slope, 6)

    # Low slope — check if converging toward one side (consensus) or split
    latest_ratios = for_ratios[-min(3, n) :]
    avg_latest = sum(latest_ratios) / len(latest_ratios)

    if variance < 0.02 and (avg_latest > 0.7 or avg_latest < 0.3):
        # Low variance and strongly skewed toward one direction
        return "emerging_consensus", round(slope, 6)

    return "stable_split", round(slope, 6)


def _bucket_members_by_period(
    members: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], list[list[dict[str, Any]]]]:
    """
    Bucket reasoning line members into time periods based on decision_date.

    Automatically selects bucketing granularity:
    - > 3 years span: bucket by year
    - 1-3 years span: bucket by quarter
    - < 1 year span: bucket by month

    Returns (period_definitions, members_per_period) where each period definition
    has keys: period_label, start_date, end_date.
    """
    # Filter to members with valid dates and sort chronologically
    dated_members: list[tuple[str, dict[str, Any]]] = []
    for m in members:
        date_str = m.get("decision_date")
        if date_str:
            date_val = str(date_str)[:10]  # YYYY-MM-DD
            if len(date_val) >= 10:
                dated_members.append((date_val, m))

    if not dated_members:
        return [], []

    dated_members.sort(key=lambda x: x[0])
    min_date = dated_members[0][0]
    max_date = dated_members[-1][0]

    min_year = int(min_date[:4])
    max_year = int(max_date[:4])
    year_span = max_year - min_year

    # Determine bucketing strategy based on date range span
    periods: list[dict[str, str]] = []

    if year_span > 3:
        # Bucket by year
        for year in range(min_year, max_year + 1):
            periods.append(
                {
                    "period_label": str(year),
                    "start_date": f"{year}-01-01",
                    "end_date": f"{year}-12-31",
                }
            )
    elif year_span >= 1:
        # Bucket by quarter
        for year in range(min_year, max_year + 1):
            for q in range(1, 5):
                start_month = (q - 1) * 3 + 1
                end_month = q * 3
                end_day = {3: 31, 6: 30, 9: 30, 12: 31}[end_month]
                periods.append(
                    {
                        "period_label": f"{year}-Q{q}",
                        "start_date": f"{year}-{start_month:02d}-01",
                        "end_date": f"{year}-{end_month:02d}-{end_day}",
                    }
                )
    else:
        # Bucket by month (same year or very close)
        min_month = int(min_date[5:7])
        max_month = int(max_date[5:7])
        year = min_year
        for month in range(min_month, max_month + 1):
            end_day = {
                1: 31,
                2: 28,
                3: 31,
                4: 30,
                5: 31,
                6: 30,
                7: 31,
                8: 31,
                9: 30,
                10: 31,
                11: 30,
                12: 31,
            }[month]
            periods.append(
                {
                    "period_label": f"{year}-{month:02d}",
                    "start_date": f"{year}-{month:02d}-01",
                    "end_date": f"{year}-{month:02d}-{end_day}",
                }
            )

    if not periods:
        return [], []

    # Assign each dated member to the matching period bucket
    members_per_period: list[list[dict[str, Any]]] = [[] for _ in periods]
    for date_val, member in dated_members:
        for idx, period in enumerate(periods):
            if period["start_date"] <= date_val <= period["end_date"]:
                members_per_period[idx].append(member)
                break

    return periods, members_per_period


# ===== Endpoint: Discovery (Milestone 1) =====


@router.post(
    "/discover",
    response_model=ReasoningLineDiscoveryResponse,
    summary="Discover clusters of judgments addressing the same legal question",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def discover_reasoning_lines(
    request: Request, body: ReasoningLineDiscoveryRequest
) -> ReasoningLineDiscoveryResponse:
    """
    Discover reasoning-line clusters by combining embedding similarity with
    shared legal bases.

    Fetches judgments from the database, clusters them using K-Means on
    normalized embeddings, then enriches each cluster with shared
    cited_legislation, coherence scores, date ranges, and representative
    cases. Returns a 2D PCA visualization graph.
    """
    start_time = time.perf_counter()
    db = get_vector_db()

    # Step 1: Fetch judgments with embeddings
    select_fields = (
        "id, case_number, title, summary, decision_date, court_name, "
        "cited_legislation, legal_topics, keywords, embedding, deep_legal_domains"
    )
    try:
        query = db.client.table("judgments").select(select_fields)

        # Apply legal domain filter if provided
        if body.legal_domain_filter:
            query = query.contains("deep_legal_domains", [body.legal_domain_filter])

        response = query.limit(body.sample_size).execute()
    except Exception as e:
        logger.error(f"Error fetching judgments for reasoning-line discovery: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch judgments from database",
        )

    docs = response.data or []
    logger.info(
        f"Fetched {len(docs)} judgments for reasoning-line discovery "
        f"(requested {body.sample_size})"
    )

    # Step 2: Parse and filter to documents with valid embeddings
    # Embeddings may be stored as JSON strings or lists depending on the table
    for doc in docs:
        emb = doc.get("embedding")
        if isinstance(emb, str):
            try:
                doc["embedding"] = json.loads(emb)
            except (json.JSONDecodeError, TypeError):
                doc["embedding"] = None

    docs_with_embeddings = [
        doc
        for doc in docs
        if doc.get("embedding")
        and isinstance(doc["embedding"], list)
        and len(doc["embedding"]) > 0
    ]

    if len(docs_with_embeddings) < body.num_clusters:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Not enough judgments with embeddings ({len(docs_with_embeddings)}) "
                f"for {body.num_clusters} clusters. "
                f"Need at least {body.num_clusters}."
            ),
        )

    # Step 3: Build embedding matrix and L2-normalize
    embeddings = np.array(
        [doc["embedding"] for doc in docs_with_embeddings],
        dtype=np.float32,
    )
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized = embeddings / norms

    # Step 4: K-Means clustering
    labels, centroids = _kmeans(normalized, body.num_clusters)

    # Normalize centroids for cosine similarity computation
    centroid_norms = np.linalg.norm(centroids, axis=1, keepdims=True)
    centroid_norms[centroid_norms == 0] = 1.0
    centroids_normalized = centroids / centroid_norms

    # Step 5: Extract TF-IDF keywords per cluster
    cluster_keywords = _extract_keywords_tfidf(
        docs_with_embeddings, labels, body.num_clusters
    )

    # Step 6: Extract shared legal bases per cluster
    cluster_legal_bases = _extract_legal_bases(
        docs_with_embeddings, labels, body.num_clusters
    )

    # Step 7: PCA 2D coordinates for visualization
    coords = _compute_pca_2d(normalized)

    # Step 8: Build cluster results
    clusters: list[DiscoveredCluster] = []

    for cluster_id in range(body.num_clusters):
        mask = labels == cluster_id
        cluster_indices = np.where(mask)[0]

        if len(cluster_indices) == 0:
            continue

        # Cosine similarity of each member to its centroid
        cluster_embeddings = normalized[cluster_indices]
        centroid = centroids_normalized[cluster_id]
        similarities = np.dot(cluster_embeddings, centroid)
        similarities = np.clip(similarities, 0.0, 1.0)

        # Build case list with similarity scores
        cases: list[DiscoveredCase] = []
        for i, idx in enumerate(cluster_indices):
            doc = docs_with_embeddings[idx]
            cases.append(
                DiscoveredCase(
                    judgment_id=str(doc["id"]),
                    signature=doc.get("case_number"),
                    title=doc.get("title"),
                    court_name=doc.get("court_name"),
                    decision_date=(
                        str(doc["decision_date"]) if doc.get("decision_date") else None
                    ),
                    similarity_to_centroid=round(float(similarities[i]), 4),
                    cited_legislation=doc.get("cited_legislation") or [],
                )
            )

        # Sort by similarity to centroid (most representative first), keep top 10
        cases.sort(key=lambda c: c.similarity_to_centroid, reverse=True)
        top_cases = cases[:10]

        # Coherence = mean cosine similarity to centroid
        coherence = float(np.mean(similarities)) if len(similarities) > 0 else 0.0

        # Auto-label from top 3 keywords
        kw = cluster_keywords.get(cluster_id, ["(no keywords)"])
        label = " / ".join(kw[:3])

        # Date range
        date_range = _compute_date_range(docs_with_embeddings, cluster_indices)

        clusters.append(
            DiscoveredCluster(
                cluster_id=cluster_id,
                label=label,
                keywords=kw,
                legal_bases=cluster_legal_bases.get(cluster_id, []),
                case_count=len(cluster_indices),
                coherence_score=round(coherence, 4),
                date_range=date_range,
                top_cases=top_cases,
            )
        )

    # Step 9: Build visualization nodes
    nodes: list[dict[str, Any]] = []
    for i, doc in enumerate(docs_with_embeddings):
        nodes.append(
            {
                "id": str(doc["id"]),
                "title": doc.get("title") or str(doc["id"]),
                "x": round(float(coords[i, 0]), 4),
                "y": round(float(coords[i, 1]), 4),
                "cluster_id": int(labels[i]),
            }
        )

    # Step 10: Build visualization edges (high-similarity pairs only)
    edges: list[dict[str, Any]] = []
    similarity_threshold = 0.75
    max_edges = 500

    for cluster_id in range(body.num_clusters):
        cluster_indices = np.where(labels == cluster_id)[0]
        if len(cluster_indices) < 2:
            continue

        cluster_embs = normalized[cluster_indices]
        sim_matrix = np.dot(cluster_embs, cluster_embs.T)

        for i in range(len(cluster_indices)):
            for j in range(i + 1, len(cluster_indices)):
                sim = float(sim_matrix[i, j])
                if sim >= similarity_threshold:
                    edges.append(
                        {
                            "source": str(
                                docs_with_embeddings[cluster_indices[i]]["id"]
                            ),
                            "target": str(
                                docs_with_embeddings[cluster_indices[j]]["id"]
                            ),
                            "similarity": round(sim, 4),
                        }
                    )

    # Keep only the strongest edges to avoid overloading the visualization
    edges.sort(key=lambda e: e["similarity"], reverse=True)
    edges = edges[:max_edges]

    # Step 11: Compute statistics
    processing_time_ms = (time.perf_counter() - start_time) * 1000
    coherence_scores = [c.coherence_score for c in clusters]

    statistics = {
        "total_documents": len(docs_with_embeddings),
        "num_clusters": len(clusters),
        "avg_coherence": round(float(np.mean(coherence_scores)), 4)
        if coherence_scores
        else 0.0,
        "processing_time_ms": round(processing_time_ms, 2),
    }

    visualization = {
        "nodes": nodes,
        "edges": edges,
    }

    logger.info(
        f"Reasoning-line discovery completed: {len(clusters)} clusters from "
        f"{len(docs_with_embeddings)} judgments in {processing_time_ms:.0f}ms"
    )

    return ReasoningLineDiscoveryResponse(
        clusters=clusters,
        statistics=statistics,
        visualization=visualization,
    )


# ===== Endpoints: CRUD Persistence (Milestone 2) =====


@router.post(
    "/create",
    response_model=ReasoningLineDetail,
    summary="Save a discovered cluster as a persistent reasoning line",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def create_reasoning_line(
    request: Request, body: CreateReasoningLineRequest
) -> ReasoningLineDetail:
    """
    Persist a reasoning line with its member judgments.

    Fetches embeddings for each judgment to compute the centroid (avg_embedding)
    and per-member similarity_to_centroid. Members are ordered chronologically
    by decision_date.
    """
    if not body.judgment_ids:
        raise HTTPException(status_code=400, detail="judgment_ids must not be empty")

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_ids: list[str] = []
    for jid in body.judgment_ids:
        if jid not in seen:
            seen.add(jid)
            unique_ids.append(jid)

    db = get_vector_db()

    # Fetch judgment metadata and embeddings for all requested IDs
    try:
        response = (
            db.client.table("judgments")
            .select("id, case_number, title, court_name, decision_date, embedding")
            .in_("id", unique_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgments for reasoning line creation: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch judgments from database"
        )

    judgments_by_id: dict[str, dict[str, Any]] = {
        str(j["id"]): j for j in (response.data or [])
    }

    # Validate that all requested judgments exist
    missing = [jid for jid in unique_ids if jid not in judgments_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Judgments not found: {missing[:10]}",  # cap error detail length
        )

    # Compute centroid from member embeddings
    embeddings_list: list[np.ndarray] = []
    for jid in unique_ids:
        emb = judgments_by_id[jid].get("embedding")
        if emb and isinstance(emb, list) and len(emb) > 0:
            embeddings_list.append(np.array(emb, dtype=np.float32))

    avg_embedding: list[float] | None = None
    centroid: np.ndarray | None = None
    if embeddings_list:
        centroid = np.mean(np.array(embeddings_list), axis=0)
        avg_embedding = centroid.tolist()

    # Sort members chronologically to assign position_in_line
    def _sort_key(jid: str) -> str:
        date = judgments_by_id[jid].get("decision_date")
        # Use empty string for missing dates so they sort first
        return str(date) if date else ""

    sorted_ids = sorted(unique_ids, key=_sort_key)

    # Compute date range from sorted members
    dates = [
        str(judgments_by_id[jid]["decision_date"])
        for jid in sorted_ids
        if judgments_by_id[jid].get("decision_date")
    ]
    date_range_start = dates[0] if dates else None
    date_range_end = dates[-1] if dates else None

    now = datetime.now(UTC).isoformat()
    line_id = str(uuid.uuid4())

    # Insert the reasoning line record
    line_row = {
        "id": line_id,
        "label": body.label,
        "legal_question": body.legal_question,
        "keywords": body.keywords,
        "legal_bases": body.legal_bases,
        "status": "active",
        "case_count": len(sorted_ids),
        "date_range_start": date_range_start,
        "date_range_end": date_range_end,
        "coherence_score": body.coherence_score,
        "created_at": now,
        "updated_at": now,
    }
    # Only include avg_embedding if we have one (pgvector expects list or null)
    if avg_embedding is not None:
        line_row["avg_embedding"] = avg_embedding

    try:
        db.client.table("reasoning_lines").insert(line_row).execute()
    except Exception as e:
        logger.error(f"Error inserting reasoning line: {e}")
        raise HTTPException(status_code=500, detail="Failed to create reasoning line")

    # Build and insert member rows
    members: list[ReasoningLineMember] = []
    member_rows: list[dict[str, Any]] = []

    for position, jid in enumerate(sorted_ids, start=1):
        judgment = judgments_by_id[jid]

        # Compute similarity to centroid for this member
        similarity = 0.0
        if centroid is not None:
            emb = judgment.get("embedding")
            if emb and isinstance(emb, list) and len(emb) > 0:
                similarity = _compute_cosine_similarity(
                    np.array(emb, dtype=np.float32), centroid
                )

        member_rows.append(
            {
                "reasoning_line_id": line_id,
                "judgment_id": jid,
                "position_in_line": position,
                "similarity_to_centroid": round(similarity, 4),
            }
        )

        members.append(
            ReasoningLineMember(
                judgment_id=jid,
                signature=judgment.get("case_number"),
                title=judgment.get("title"),
                court_name=judgment.get("court_name"),
                decision_date=(
                    str(judgment["decision_date"])
                    if judgment.get("decision_date")
                    else None
                ),
                position_in_line=position,
                similarity_to_centroid=round(similarity, 4),
            )
        )

    try:
        db.client.table("reasoning_line_members").insert(member_rows).execute()
    except Exception as e:
        logger.error(f"Error inserting reasoning line members: {e}")
        # Clean up the parent row on failure
        db.client.table("reasoning_lines").delete().eq("id", line_id).execute()
        raise HTTPException(
            status_code=500, detail="Failed to create reasoning line members"
        )

    logger.info(
        f"Created reasoning line {line_id} with {len(members)} members "
        f"(label={body.label!r})"
    )

    return ReasoningLineDetail(
        id=line_id,
        label=body.label,
        legal_question=body.legal_question,
        keywords=body.keywords,
        legal_bases=body.legal_bases,
        status="active",
        case_count=len(members),
        coherence_score=body.coherence_score,
        date_range_start=date_range_start,
        date_range_end=date_range_end,
        created_at=now,
        updated_at=now,
        members=members,
    )


@router.get(
    "/",
    response_model=list[ReasoningLineSummary],
    summary="List saved reasoning lines",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def list_reasoning_lines(
    request: Request,
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, ge=1, le=200, description="Max results to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> list[ReasoningLineSummary]:
    """
    Return a paginated list of saved reasoning lines, ordered by creation date
    (newest first). Optionally filter by status.
    """
    db = get_vector_db()

    select_fields = (
        "id, label, legal_question, keywords, legal_bases, status, "
        "case_count, coherence_score, date_range_start, date_range_end, created_at"
    )

    try:
        query = db.client.table("reasoning_lines").select(select_fields)

        if status:
            valid_statuses = {"active", "merged", "superseded", "dormant"}
            if status not in valid_statuses:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status filter. Must be one of: {', '.join(sorted(valid_statuses))}",
                )
            query = query.eq("status", status)

        response = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing reasoning lines: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reasoning lines")

    rows = response.data or []

    return [
        ReasoningLineSummary(
            id=str(row["id"]),
            label=row["label"],
            legal_question=row["legal_question"],
            keywords=row.get("keywords") or [],
            legal_bases=row.get("legal_bases") or [],
            status=row["status"],
            case_count=row.get("case_count", 0),
            coherence_score=row.get("coherence_score"),
            date_range_start=str(row["date_range_start"])
            if row.get("date_range_start")
            else None,
            date_range_end=str(row["date_range_end"])
            if row.get("date_range_end")
            else None,
            created_at=str(row["created_at"]),
        )
        for row in rows
    ]


@router.get(
    "/{line_id}",
    response_model=ReasoningLineDetail,
    summary="Get full detail of a reasoning line with all members",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_reasoning_line(request: Request, line_id: str) -> ReasoningLineDetail:
    """
    Retrieve a single reasoning line by ID, including all member judgments
    with their metadata joined from the judgments table.
    """
    db = get_vector_db()

    # Fetch the reasoning line
    line_fields = (
        "id, label, legal_question, keywords, legal_bases, status, "
        "case_count, coherence_score, date_range_start, date_range_end, "
        "created_at, updated_at"
    )
    try:
        response = (
            db.client.table("reasoning_lines")
            .select(line_fields)
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    line = rows[0]

    # Fetch members ordered by position_in_line
    member_fields = (
        "judgment_id, position_in_line, similarity_to_centroid, "
        "reasoning_pattern, outcome_direction"
    )
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select(member_fields)
            .eq("reasoning_line_id", line_id)
            .order("position_in_line")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching members for reasoning line {line_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []

    # Fetch judgment metadata for all members in one batch query
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]
    judgments_by_id: dict[str, dict[str, Any]] = {}

    if judgment_ids:
        try:
            j_response = (
                db.client.table("judgments")
                .select("id, case_number, title, court_name, decision_date")
                .in_("id", judgment_ids)
                .execute()
            )
            judgments_by_id = {str(j["id"]): j for j in (j_response.data or [])}
        except Exception as e:
            logger.warning(f"Error fetching judgment details for line {line_id}: {e}")
            # Non-fatal: we still return members with available data

    members: list[ReasoningLineMember] = []
    for m in member_rows:
        jid = str(m["judgment_id"])
        judgment = judgments_by_id.get(jid, {})
        members.append(
            ReasoningLineMember(
                judgment_id=jid,
                signature=judgment.get("case_number"),
                title=judgment.get("title"),
                court_name=judgment.get("court_name"),
                decision_date=(
                    str(judgment["decision_date"])
                    if judgment.get("decision_date")
                    else None
                ),
                position_in_line=m.get("position_in_line", 0),
                similarity_to_centroid=m.get("similarity_to_centroid", 0.0),
                reasoning_pattern=m.get("reasoning_pattern"),
                outcome_direction=m.get("outcome_direction"),
            )
        )

    return ReasoningLineDetail(
        id=str(line["id"]),
        label=line["label"],
        legal_question=line["legal_question"],
        keywords=line.get("keywords") or [],
        legal_bases=line.get("legal_bases") or [],
        status=line["status"],
        case_count=line.get("case_count", 0),
        coherence_score=line.get("coherence_score"),
        date_range_start=str(line["date_range_start"])
        if line.get("date_range_start")
        else None,
        date_range_end=str(line["date_range_end"])
        if line.get("date_range_end")
        else None,
        created_at=str(line["created_at"]),
        updated_at=str(line.get("updated_at") or line["created_at"]),
        members=members,
    )


@router.delete(
    "/{line_id}",
    summary="Soft-delete a reasoning line by setting status to superseded",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def delete_reasoning_line(request: Request, line_id: str) -> dict[str, str]:
    """
    Soft-delete a reasoning line by setting its status to 'superseded'.
    The line and its members remain in the database for historical reference.
    """
    db = get_vector_db()

    # Verify the line exists
    try:
        response = (
            db.client.table("reasoning_lines")
            .select("id, status")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error checking reasoning line {line_id} for deletion: {e}")
        raise HTTPException(status_code=500, detail="Failed to check reasoning line")

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    # Perform soft delete
    now = datetime.now(UTC).isoformat()
    try:
        db.client.table("reasoning_lines").update(
            {"status": "superseded", "updated_at": now}
        ).eq("id", line_id).execute()
    except Exception as e:
        logger.error(f"Error soft-deleting reasoning line {line_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete reasoning line")

    logger.info(f"Soft-deleted reasoning line {line_id} (status -> superseded)")

    return {"status": "deleted", "id": line_id}


# ===== Endpoints: Temporal Outcome Timeline (Milestone 3) =====


@router.post(
    "/{line_id}/analyze-outcomes",
    response_model=OutcomeClassificationResult,
    summary="Classify outcome direction for each member judgment using LLM",
)
@limiter.limit(REASONING_LINES_LLM_RATE_LIMIT)
async def analyze_outcomes(
    request: Request, line_id: str
) -> OutcomeClassificationResult:
    """
    Use LLM to classify each member judgment's outcome direction relative
    to the reasoning line's legal question.

    For each member that does not already have an outcome_direction set,
    the LLM classifies the judgment as 'for', 'against', 'mixed', or
    'procedural'. Results are persisted to the reasoning_line_members table.

    Processes at most 50 members per call to avoid timeout. Members that
    already have outcome_direction set are skipped.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line to get the legal question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching reasoning line {line_id} for outcome analysis: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch all members and identify those needing classification
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id, outcome_direction")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching members for outcome analysis on line {line_id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    all_members = members_response.data or []

    # Separate already-classified from unclassified members
    unclassified_ids: list[str] = []
    skipped = 0
    for m in all_members:
        if m.get("outcome_direction"):
            skipped += 1
        else:
            unclassified_ids.append(str(m["judgment_id"]))

    # Cap at max members per call to avoid timeout
    unclassified_ids = unclassified_ids[:_OUTCOME_MAX_MEMBERS_PER_CALL]

    if not unclassified_ids:
        logger.info(f"All members of line {line_id} already classified, nothing to do")
        return OutcomeClassificationResult(classified=0, skipped=skipped, errors=0)

    # Step 3: Fetch judgment text (full_text preferred, fallback to summary)
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, full_text, summary")
            .in_("id", unclassified_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment texts for outcome analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment texts")

    judgments_by_id: dict[str, dict[str, Any]] = {
        str(j["id"]): j for j in (j_response.data or [])
    }

    # Step 4: Build LLM chain (same pattern as argumentation.py)
    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", OUTCOME_CLASSIFICATION_SYSTEM_PROMPT),
            ("human", OUTCOME_CLASSIFICATION_USER_PROMPT),
        ]
    )
    llm = get_default_llm(use_mini_model=True)  # mini model for cost efficiency
    parser = JsonOutputParser()
    chain = chat_prompt | llm | parser

    valid_directions = {"for", "against", "mixed", "procedural"}

    # Step 5: Classify each unclassified member individually
    classified = 0
    errors = 0

    for jid in unclassified_ids:
        judgment = judgments_by_id.get(jid)
        if not judgment:
            logger.warning(
                f"Judgment {jid} not found in database, skipping classification"
            )
            errors += 1
            continue

        # Extract text, preferring full_text over summary, truncated to limit
        text = judgment.get("full_text") or judgment.get("summary") or ""
        if not text:
            logger.warning(
                f"Judgment {jid} has no text content, skipping classification"
            )
            errors += 1
            continue

        text = text[:_OUTCOME_TEXT_MAX_CHARS]

        try:
            result = await chain.ainvoke(
                {
                    "legal_question": legal_question,
                    "text": text,
                }
            )

            # Validate and extract outcome direction from LLM response
            direction = result.get("outcome_direction", "").lower().strip()
            if direction not in valid_directions:
                logger.warning(
                    f"LLM returned invalid outcome_direction '{direction}' "
                    f"for judgment {jid}, skipping"
                )
                errors += 1
                continue

            # Persist the classification to the database
            db.client.table("reasoning_line_members").update(
                {"outcome_direction": direction}
            ).eq("reasoning_line_id", line_id).eq("judgment_id", jid).execute()

            classified += 1
            logger.debug(
                f"Classified judgment {jid} as '{direction}' for line {line_id}"
            )

        except Exception as e:
            logger.error(f"LLM classification failed for judgment {jid}: {e}")
            errors += 1
            continue

    logger.info(
        f"Outcome analysis for line {line_id}: classified={classified}, "
        f"skipped={skipped}, errors={errors}"
    )

    return OutcomeClassificationResult(
        classified=classified,
        skipped=skipped,
        errors=errors,
    )


@router.get(
    "/{line_id}/timeline",
    response_model=ReasoningLineTimeline,
    summary="Get temporal outcome distribution for a reasoning line",
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_reasoning_line_timeline(
    request: Request, line_id: str
) -> ReasoningLineTimeline:
    """
    Return time-bucketed outcome distribution for a reasoning line, suitable
    for timeline visualization.

    Automatically selects the bucketing granularity based on the date range:
    - > 3 years: bucket by year
    - 1-3 years: bucket by quarter
    - < 1 year: bucket by month

    Detects overall trend using linear regression on the 'for' ratio over time.
    Returns 'insufficient_data' trend if fewer than 3 time periods have data.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line for legal_question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id} for timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch all members with outcome_direction
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id, outcome_direction")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching members for timeline on line {line_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []
    if not member_rows:
        return ReasoningLineTimeline(
            line_id=line_id,
            legal_question=legal_question,
            points=[],
            trend="insufficient_data",
            trend_slope=0.0,
            total_classified=0,
            total_unclassified=0,
        )

    # Step 3: Fetch decision_date for each member's judgment
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, decision_date")
            .in_("id", judgment_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment dates for timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment dates")

    dates_by_id: dict[str, str | None] = {
        str(j["id"]): str(j["decision_date"]) if j.get("decision_date") else None
        for j in (j_response.data or [])
    }

    # Step 4: Merge member data with dates for bucketing
    enriched_members: list[dict[str, Any]] = []
    total_classified = 0
    total_unclassified = 0

    for m in member_rows:
        jid = str(m["judgment_id"])
        direction = m.get("outcome_direction")
        if direction:
            total_classified += 1
        else:
            total_unclassified += 1

        enriched_members.append(
            {
                "judgment_id": jid,
                "decision_date": dates_by_id.get(jid),
                "outcome_direction": direction,
            }
        )

    # Step 5: Bucket members into time periods
    periods, members_per_period = _bucket_members_by_period(enriched_members)

    if not periods:
        return ReasoningLineTimeline(
            line_id=line_id,
            legal_question=legal_question,
            points=[],
            trend="insufficient_data",
            trend_slope=0.0,
            total_classified=total_classified,
            total_unclassified=total_unclassified,
        )

    # Step 6: Count outcome directions per period and compute for_ratio
    points: list[TimelinePoint] = []
    for_ratios: list[float] = []

    for period_def, period_members in zip(periods, members_per_period, strict=True):
        total = len(period_members)
        for_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "for"
        )
        against_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "against"
        )
        mixed_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "mixed"
        )
        procedural_count = sum(
            1 for m in period_members if m.get("outcome_direction") == "procedural"
        )
        unclassified_count = sum(
            1 for m in period_members if not m.get("outcome_direction")
        )

        # for_ratio: proportion of classified outcomes that are "for"
        classified_in_period = (
            for_count + against_count + mixed_count + procedural_count
        )
        for_ratio = (
            for_count / classified_in_period if classified_in_period > 0 else 0.0
        )

        points.append(
            TimelinePoint(
                period_label=period_def["period_label"],
                start_date=period_def["start_date"],
                end_date=period_def["end_date"],
                total=total,
                for_count=for_count,
                against_count=against_count,
                mixed_count=mixed_count,
                procedural_count=procedural_count,
                unclassified_count=unclassified_count,
                for_ratio=round(for_ratio, 4),
            )
        )

        # Only include periods with classified data in trend analysis
        if classified_in_period > 0:
            for_ratios.append(for_ratio)

    # Step 7: Detect overall trend from for_ratio time series
    trend, trend_slope = _detect_timeline_trend(for_ratios)

    logger.info(
        f"Timeline for line {line_id}: {len(points)} periods, trend={trend}, "
        f"slope={trend_slope}, classified={total_classified}, "
        f"unclassified={total_unclassified}"
    )

    return ReasoningLineTimeline(
        line_id=line_id,
        legal_question=legal_question,
        points=points,
        trend=trend,
        trend_slope=trend_slope,
        total_classified=total_classified,
        total_unclassified=total_unclassified,
    )


# ===== Milestone 5: Language Drift Detection Models =====


class DriftWindow(BaseModel):
    """A single rolling time window in the drift analysis."""

    window_index: int
    period_start: str | None = Field(
        description="decision_date of the first judgment in this window"
    )
    period_end: str | None = Field(
        description="decision_date of the last judgment in this window"
    )
    case_count: int
    drift_score: float = Field(
        ge=0.0, description="0 = no drift from previous window, higher = more drift"
    )
    top_keywords: list[str] = Field(description="Top 5 keywords for this window")
    entering_keywords: list[str] = Field(
        default_factory=list,
        description="New keywords not present in the previous window",
    )
    exiting_keywords: list[str] = Field(
        default_factory=list,
        description="Keywords that disappeared compared to the previous window",
    )


class DriftPeak(BaseModel):
    """A detected drift peak where language shifted significantly."""

    window_index: int
    drift_score: float
    period_start: str | None
    period_end: str | None
    entering_keywords: list[str]
    exiting_keywords: list[str]


class DriftAnalysisResponse(BaseModel):
    """Response from the language drift detection analysis."""

    line_id: str
    legal_question: str
    windows: list[DriftWindow]
    peaks: list[DriftPeak]
    avg_drift: float
    max_drift: float
    drift_events_created: int
    total_members_analyzed: int


# ===== Milestone 5: Drift Detection Helpers =====

# Polish + English stopwords (same set used in clustering.py for consistency)
_DRIFT_STOPWORDS: set[str] = {
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
}


def _extract_window_keywords(
    judgments: list[dict[str, Any]], top_n: int = 5
) -> list[str]:
    """
    Extract top-N keywords from a window of judgments using simple term frequency.

    Combines title + summary text from each judgment, tokenizes, filters stopwords,
    and returns the most frequent terms.
    """
    word_counts: Counter = Counter()

    for doc in judgments:
        text_parts: list[str] = []
        if doc.get("title"):
            text_parts.append(doc["title"])
        if doc.get("summary"):
            text_parts.append(doc["summary"])
        text = " ".join(text_parts).lower()

        # Tokenize: keep only alphabetic words longer than 2 chars
        words = [
            w
            for w in text.split()
            if len(w) > 2 and w not in _DRIFT_STOPWORDS and w.isalpha()
        ]
        word_counts.update(words)

    return [word for word, _ in word_counts.most_common(top_n)]


# ===== Endpoint: Language Drift Detection (Milestone 5) =====


@router.post(
    "/{line_id}/drift-analysis",
    response_model=DriftAnalysisResponse,
    summary="Detect language drift within a reasoning line over time",
)
@limiter.limit(REASONING_LINES_RATE_LIMIT)
async def analyze_drift(request: Request, line_id: str) -> DriftAnalysisResponse:
    """
    Detect language drift within a reasoning line by analyzing how the
    embedding centroid shifts across rolling time windows.

    Sorts member judgments chronologically, creates overlapping windows,
    computes centroid drift between consecutive windows, extracts
    entering/exiting keywords, and identifies significant drift peaks.
    Drift events are persisted to the reasoning_line_events table.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line to get its legal_question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line {line_id} for drift analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch member judgment IDs from reasoning_line_members
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching members for drift analysis on line {line_id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    member_rows = members_response.data or []
    judgment_ids = [str(m["judgment_id"]) for m in member_rows]

    if len(judgment_ids) < 6:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Drift analysis requires at least 6 members, but reasoning line "
                f"{line_id} has {len(judgment_ids)}. Add more judgments first."
            ),
        )

    # Step 3: Fetch judgments with embeddings, titles, summaries, and decision_dates
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, title, summary, decision_date, embedding")
            .in_("id", judgment_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment embeddings for drift analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment data")

    judgments_raw = j_response.data or []

    # Filter to judgments that have valid embeddings
    judgments_with_embeddings = [
        j
        for j in judgments_raw
        if j.get("embedding")
        and isinstance(j["embedding"], list)
        and len(j["embedding"]) > 0
    ]

    if len(judgments_with_embeddings) < 6:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Drift analysis requires at least 6 members with embeddings, "
                f"but only {len(judgments_with_embeddings)} have valid embeddings."
            ),
        )

    # Step 4: Sort members chronologically by decision_date
    def _date_sort_key(j: dict[str, Any]) -> str:
        date = j.get("decision_date")
        return str(date) if date else ""

    sorted_judgments = sorted(judgments_with_embeddings, key=_date_sort_key)

    total_members = len(sorted_judgments)
    logger.info(
        f"Starting drift analysis for line {line_id} with {total_members} members"
    )

    # Step 5: Determine window size and create rolling windows
    # Window size: min(5, len // 3) but at least 3
    window_size = max(3, min(5, total_members // 3))
    stride = 1

    # Build list of windows (each is a slice of sorted judgments)
    window_slices: list[list[dict[str, Any]]] = []
    for start_idx in range(0, total_members - window_size + 1, stride):
        window_slices.append(sorted_judgments[start_idx : start_idx + window_size])

    if len(window_slices) < 2:
        # Not enough windows to compute drift between consecutive pairs
        raise HTTPException(
            status_code=400,
            detail=(
                f"Not enough data to form at least 2 rolling windows. "
                f"Have {total_members} members with window_size={window_size}."
            ),
        )

    # Step 6: For each window, compute centroid embedding and extract keywords
    window_centroids: list[np.ndarray] = []
    window_keywords_list: list[list[str]] = []

    for window_docs in window_slices:
        # Compute centroid as mean of embeddings in the window
        emb_matrix = np.array(
            [doc["embedding"] for doc in window_docs], dtype=np.float32
        )
        centroid = np.mean(emb_matrix, axis=0)
        window_centroids.append(centroid)

        # Extract top keywords for this window
        keywords = _extract_window_keywords(window_docs, top_n=5)
        window_keywords_list.append(keywords)

    # Step 7: Compute drift scores between consecutive windows
    drift_scores: list[float] = [0.0]  # First window has no predecessor, drift = 0

    for i in range(1, len(window_centroids)):
        similarity = _compute_cosine_similarity(
            window_centroids[i - 1], window_centroids[i]
        )
        # drift_score = 1 - cosine_similarity (higher = more drift)
        drift = round(1.0 - similarity, 6)
        drift_scores.append(drift)

    # Step 8: Compare consecutive keyword sets for entering/exiting keywords
    entering_keywords_per_window: list[list[str]] = [[]]  # first window has none
    exiting_keywords_per_window: list[list[str]] = [[]]  # first window has none

    for i in range(1, len(window_keywords_list)):
        prev_set = set(window_keywords_list[i - 1])
        curr_set = set(window_keywords_list[i])
        entering_keywords_per_window.append(sorted(curr_set - prev_set))
        exiting_keywords_per_window.append(sorted(prev_set - curr_set))

    # Step 9: Build DriftWindow objects
    drift_windows: list[DriftWindow] = []

    for i, window_docs in enumerate(window_slices):
        # Period start/end from the first and last judgment in this window
        first_date = window_docs[0].get("decision_date")
        last_date = window_docs[-1].get("decision_date")

        drift_windows.append(
            DriftWindow(
                window_index=i,
                period_start=str(first_date) if first_date else None,
                period_end=str(last_date) if last_date else None,
                case_count=len(window_docs),
                drift_score=round(drift_scores[i], 4),
                top_keywords=window_keywords_list[i],
                entering_keywords=entering_keywords_per_window[i],
                exiting_keywords=exiting_keywords_per_window[i],
            )
        )

    # Step 10: Identify drift peaks (drift_score > mean + 1.5 * std)
    # Only consider windows with index > 0 (they have meaningful drift scores)
    meaningful_scores = np.array(drift_scores[1:], dtype=np.float64)
    peaks: list[DriftPeak] = []

    if len(meaningful_scores) > 0:
        mean_drift = float(np.mean(meaningful_scores))
        std_drift = float(np.std(meaningful_scores))
        threshold = mean_drift + 1.5 * std_drift

        for i in range(1, len(drift_scores)):
            if drift_scores[i] > threshold:
                window = drift_windows[i]
                peaks.append(
                    DriftPeak(
                        window_index=i,
                        drift_score=window.drift_score,
                        period_start=window.period_start,
                        period_end=window.period_end,
                        entering_keywords=window.entering_keywords,
                        exiting_keywords=window.exiting_keywords,
                    )
                )

    # Step 11: Write drift events to reasoning_line_events for each peak
    drift_events_created = 0

    if peaks:
        event_rows: list[dict[str, Any]] = []
        now = datetime.now(UTC).isoformat()

        for peak in peaks:
            entering_str = (
                ", ".join(peak.entering_keywords) if peak.entering_keywords else "none"
            )
            exiting_str = (
                ", ".join(peak.exiting_keywords) if peak.exiting_keywords else "none"
            )

            event_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "event_type": "drift",
                    "source_line_id": line_id,
                    "event_date": peak.period_end,
                    "drift_score": peak.drift_score,
                    "description": (
                        f"Language drift detected: entering [{entering_str}], "
                        f"exiting [{exiting_str}]"
                    ),
                    "confidence": round(min(peak.drift_score * 2, 1.0), 4),
                    "metadata": {
                        "entering_keywords": peak.entering_keywords,
                        "exiting_keywords": peak.exiting_keywords,
                        "window_index": peak.window_index,
                    },
                    "created_at": now,
                }
            )

        try:
            db.client.table("reasoning_line_events").insert(event_rows).execute()
            drift_events_created = len(event_rows)
            logger.info(
                f"Created {drift_events_created} drift events for line {line_id}"
            )
        except Exception as e:
            logger.error(
                f"Error writing drift events for line {line_id}: {e}. "
                f"Analysis results are still returned."
            )
            # Non-fatal: return the analysis even if event persistence fails

    # Step 12: Compute summary statistics
    all_drift_scores = [w.drift_score for w in drift_windows]
    avg_drift = round(float(np.mean(all_drift_scores)), 4) if all_drift_scores else 0.0
    max_drift = round(float(np.max(all_drift_scores)), 4) if all_drift_scores else 0.0

    logger.info(
        f"Drift analysis complete for line {line_id}: "
        f"{len(drift_windows)} windows, {len(peaks)} peaks, "
        f"avg_drift={avg_drift}, max_drift={max_drift}"
    )

    return DriftAnalysisResponse(
        line_id=line_id,
        legal_question=legal_question,
        windows=drift_windows,
        peaks=peaks,
        avg_drift=avg_drift,
        max_drift=max_drift,
        drift_events_created=drift_events_created,
        total_members_analyzed=total_members,
    )


# ===== Milestone 6: Semantic Search & Cross-Reference Models =====


class ReasoningLineSearchRequest(BaseModel):
    """Request for semantic search across reasoning lines."""

    query: str = Field(
        description="Natural language legal question to search for",
        min_length=5,
        max_length=1000,
    )
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.3, ge=0.0, le=1.0)


class ReasoningLineSearchResult(BaseModel):
    """A single reasoning line matching the search query."""

    id: str
    label: str
    legal_question: str
    keywords: list[str]
    legal_bases: list[str]
    case_count: int
    coherence_score: float | None
    similarity: float  # cosine similarity to query


class ReasoningLineSearchResponse(BaseModel):
    """Response from semantic search across reasoning lines."""

    results: list[ReasoningLineSearchResult]
    query: str
    total_found: int


class RelatedReasoningLine(BaseModel):
    """A reasoning line related to a given line."""

    id: str
    label: str
    legal_question: str
    keywords: list[str]
    case_count: int
    relatedness_score: float
    shared_legal_bases: list[str]
    shared_keywords: list[str]


class RelatedLinesResponse(BaseModel):
    """Response containing lines related to a given reasoning line."""

    line_id: str
    related: list[RelatedReasoningLine]


# ===== Milestone 6: Helper Functions =====


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors.

    Returns 0.0 if either vector has zero norm to avoid division by zero.
    """
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _jaccard_similarity(set_a: set, set_b: set) -> float:
    """Compute Jaccard similarity between two sets.

    Returns 0.0 if both sets are empty.
    """
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def _text_overlap_score(query_tokens: set[str], line_tokens: set[str]) -> float:
    """Compute token overlap score between query and line text.

    Uses a simple Jaccard-like metric over lowercased word tokens.
    Returns 0.0 if either set is empty.
    """
    if not query_tokens or not line_tokens:
        return 0.0
    intersection = query_tokens & line_tokens
    # Use the smaller set as denominator for a recall-oriented metric
    return len(intersection) / min(len(query_tokens), len(line_tokens))


def _tokenize(text: str) -> set[str]:
    """Tokenize text into lowercased word tokens, filtering short tokens."""
    import re

    return {w.lower() for w in re.findall(r"\w+", text) if len(w) > 2}


# ===== Milestone 6: Semantic Search Endpoint =====


REASONING_LINES_SEARCH_RATE_LIMIT = "30/hour"


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
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning lines"
        )

    rows = response.data or []
    if not rows:
        return ReasoningLineSearchResponse(
            results=[], query=body.query, total_found=0
        )

    logger.info(
        f"Searching {len(rows)} reasoning lines for query: '{body.query[:80]}...'"
    )

    # Step 2: Try embedding-based search first, fall back to text-based
    use_embedding = False
    query_embedding: np.ndarray | None = None

    try:
        from app.documents_pkg.utils import generate_embedding

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
                    logger.debug(
                        f"Could not parse embedding for line {row['id']}: {e}"
                    )
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
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line"
        )

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
            logger.warning(
                f"Could not parse embedding for target line {line_id}: {e}"
            )

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
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning lines"
        )

    others = others_resp.data or []
    if not others:
        return RelatedLinesResponse(line_id=line_id, related=[])

    logger.info(
        f"Computing relatedness of {len(others)} lines to line {line_id}"
    )

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
                    embedding_sim = _cosine_similarity(
                        target_embedding, row_embedding
                    )
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

    logger.info(
        f"Found {len(related)} related lines for line {line_id}"
    )

    return RelatedLinesResponse(line_id=line_id, related=related)


# =============================================================================
# Milestone 4: Branch & Merge Detection (DAG Edges)
# =============================================================================


# ===== M4 Response Models =====


class EventDetectionResult(BaseModel):
    """Summary result of branch/merge/influence event detection across reasoning lines."""

    branches_detected: int
    merges_detected: int
    influences_detected: int
    lines_analyzed: int
    processing_time_ms: float


class DAGNode(BaseModel):
    """A reasoning line represented as a node in the DAG visualization."""

    id: str
    label: str
    status: str  # active, merged, superseded, dormant
    case_count: int
    coherence_score: float | None
    date_range_start: str | None
    date_range_end: str | None
    keywords: list[str]


class DAGEdge(BaseModel):
    """An event (branch, merge, drift, reversal, influence) as an edge in the DAG."""

    id: str
    event_type: str  # branch, merge, drift, reversal, influence
    source_id: str
    target_id: str
    event_date: str | None
    description: str | None
    confidence: float | None
    drift_score: float | None


class ReasoningLineDAG(BaseModel):
    """Full DAG structure combining reasoning line nodes and event edges."""

    nodes: list[DAGNode]
    edges: list[DAGEdge]
    statistics: dict[str, Any]


# ===== M4 Helpers =====


def _lines_share_legal_bases(
    line_a: dict[str, Any], line_b: dict[str, Any], min_overlap: int = 1
) -> tuple[bool, float]:
    """
    Check whether two reasoning lines share at least `min_overlap` legal bases.

    Returns a tuple of (shares_enough, overlap_ratio) where overlap_ratio is
    the Jaccard-like ratio: |intersection| / |smaller set|.
    """
    bases_a = set(line_a.get("legal_bases") or [])
    bases_b = set(line_b.get("legal_bases") or [])

    if not bases_a or not bases_b:
        return False, 0.0

    intersection = bases_a & bases_b
    min_size = min(len(bases_a), len(bases_b))
    overlap_ratio = len(intersection) / min_size if min_size > 0 else 0.0

    return len(intersection) >= min_overlap, overlap_ratio


def _detect_internal_branch(
    members: list[dict[str, Any]],
) -> tuple[bool, float, float]:
    """
    Detect whether a reasoning line shows an internal split (potential branch).

    Splits members into time-ordered first-half and second-half, computes centroid
    embeddings for each half, and checks for divergence.

    Returns (is_branch, centroid_similarity, outcome_divergence).
    """
    if len(members) < 5:
        return False, 1.0, 0.0

    # Sort by decision_date
    sorted_members = sorted(
        members, key=lambda m: str(m.get("decision_date") or "")
    )

    mid = len(sorted_members) // 2
    first_half = sorted_members[:mid]
    second_half = sorted_members[mid:]

    # Compute centroid embeddings for each half
    first_embeddings = [
        m["embedding"] for m in first_half
        if m.get("embedding") and isinstance(m["embedding"], list) and len(m["embedding"]) > 0
    ]
    second_embeddings = [
        m["embedding"] for m in second_half
        if m.get("embedding") and isinstance(m["embedding"], list) and len(m["embedding"]) > 0
    ]

    if not first_embeddings or not second_embeddings:
        return False, 1.0, 0.0

    first_centroid = np.mean(np.array(first_embeddings, dtype=np.float32), axis=0)
    second_centroid = np.mean(np.array(second_embeddings, dtype=np.float32), axis=0)

    similarity = _compute_cosine_similarity(first_centroid, second_centroid)

    # Check outcome distribution divergence
    def _outcome_dist(member_list: list[dict[str, Any]]) -> dict[str, float]:
        outcomes = [m.get("outcome_direction") or "unclassified" for m in member_list]
        total = len(outcomes)
        if total == 0:
            return {}
        counter = Counter(outcomes)
        return {k: v / total for k, v in counter.items()}

    first_dist = _outcome_dist(first_half)
    second_dist = _outcome_dist(second_half)

    # Compute outcome divergence as sum of absolute differences across all outcome types
    all_outcomes = set(first_dist.keys()) | set(second_dist.keys())
    outcome_divergence = sum(
        abs(first_dist.get(k, 0.0) - second_dist.get(k, 0.0)) for k in all_outcomes
    ) / 2.0  # Normalize to [0, 1]

    # Branch if centroid similarity is low AND outcomes differ significantly
    is_branch = similarity < 0.85 and outcome_divergence > 0.3

    return is_branch, round(similarity, 4), round(outcome_divergence, 4)


def _find_shared_recent_judgments(
    members_a: list[dict[str, Any]],
    members_b: list[dict[str, Any]],
    recent_years: int = 2,
) -> list[str]:
    """
    Find judgment IDs that appear in both lines' members within the last N years.

    Returns a list of shared judgment IDs sorted by date descending.
    """
    from datetime import date, timedelta

    cutoff = date.today() - timedelta(days=recent_years * 365)
    cutoff_str = cutoff.isoformat()

    def _recent_ids(members: list[dict[str, Any]]) -> set[str]:
        return {
            str(m["judgment_id"])
            for m in members
            if str(m.get("decision_date") or "") >= cutoff_str
        }

    recent_a = _recent_ids(members_a)
    recent_b = _recent_ids(members_b)

    return sorted(recent_a & recent_b)


# ===== M4 Endpoints =====


@router.post(
    "/detect-events",
    response_model=EventDetectionResult,
    summary="Detect branch/merge/influence events across reasoning lines",
    description=(
        "Scans all active reasoning lines and detects branch and merge events "
        "between them. Expensive computation — limited to 5 requests per hour."
    ),
)
@limiter.limit(REASONING_LINES_LLM_RATE_LIMIT)
async def detect_events(request: Request) -> EventDetectionResult:
    """
    Milestone 4 — Branch & Merge Detection.

    Scans active reasoning lines, detects internal branch signals,
    cross-line branch/merge/influence events, and persists them as
    reasoning_line_events rows.
    """
    start_time = time.time()

    db = get_vector_db()
    branches_detected = 0
    merges_detected = 0
    influences_detected = 0

    # Step 1: Fetch all active reasoning lines (cap at 50 to prevent timeouts)
    MAX_LINES = 50
    try:
        lines_response = (
            db.client.table("reasoning_lines")
            .select("id, label, legal_question, keywords, legal_bases, status, case_count, "
                    "coherence_score, avg_embedding, date_range_start, date_range_end")
            .in_("status", ["active", "merged"])
            .limit(MAX_LINES)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning lines for event detection: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    lines = lines_response.data or []
    if len(lines) < 2:
        elapsed = round((time.time() - start_time) * 1000, 1)
        return EventDetectionResult(
            branches_detected=0,
            merges_detected=0,
            influences_detected=0,
            lines_analyzed=len(lines),
            processing_time_ms=elapsed,
        )

    logger.info(f"Event detection: analyzing {len(lines)} reasoning lines")

    # Step 2: Fetch members for each line (with embeddings and outcome_direction)
    line_members: dict[str, list[dict[str, Any]]] = {}
    line_by_id: dict[str, dict[str, Any]] = {}

    for line in lines:
        line_id = str(line["id"])
        line_by_id[line_id] = line

        try:
            members_resp = (
                db.client.table("reasoning_line_members")
                .select("judgment_id, outcome_direction")
                .eq("reasoning_line_id", line_id)
                .execute()
            )
            member_rows = members_resp.data or []
            judgment_ids = [str(m["judgment_id"]) for m in member_rows]

            if not judgment_ids:
                line_members[line_id] = []
                continue

            # Fetch judgment details with embeddings and dates
            j_resp = (
                db.client.table("judgments")
                .select("id, decision_date, embedding")
                .in_("id", judgment_ids)
                .execute()
            )
            judgment_map = {str(j["id"]): j for j in (j_resp.data or [])}

            # Merge member outcome_direction with judgment data
            enriched = []
            for m in member_rows:
                jid = str(m["judgment_id"])
                if jid in judgment_map:
                    merged = {**judgment_map[jid], "outcome_direction": m.get("outcome_direction")}
                    enriched.append(merged)

            line_members[line_id] = enriched

        except Exception as e:
            logger.warning(f"Error fetching members for line {line_id}: {e}")
            line_members[line_id] = []

    # Step 3: Internal branch detection (within each line)
    now = datetime.now(UTC).isoformat()
    event_rows: list[dict[str, Any]] = []

    for line_id, members in line_members.items():
        if len(members) < 5:
            continue

        is_branch, sim, outcome_div = _detect_internal_branch(members)
        if is_branch:
            event_rows.append({
                "id": str(uuid.uuid4()),
                "event_type": "branch",
                "source_line_id": line_id,
                "target_line_id": None,
                "trigger_judgment_id": None,
                "event_date": None,
                "description": (
                    f"Internal split detected in line '{line_by_id[line_id].get('label', '')}': "
                    f"first/second half centroid similarity={sim}, "
                    f"outcome divergence={outcome_div}"
                ),
                "confidence": round(min((1.0 - sim) + outcome_div, 1.0), 4),
                "drift_score": round(1.0 - sim, 4),
                "metadata": {
                    "detection_type": "internal_split",
                    "centroid_similarity": sim,
                    "outcome_divergence": outcome_div,
                },
                "created_at": now,
            })
            branches_detected += 1
            logger.info(
                f"Internal branch detected in line {line_id}: "
                f"sim={sim}, outcome_div={outcome_div}"
            )

    # Step 4: Cross-line detection (branch, merge, influence)
    line_ids = list(line_by_id.keys())

    for i in range(len(line_ids)):
        for j in range(i + 1, len(line_ids)):
            lid_a = line_ids[i]
            lid_b = line_ids[j]
            line_a = line_by_id[lid_a]
            line_b = line_by_id[lid_b]

            # Only compare lines that share at least 1 legal base
            shares, overlap_ratio = _lines_share_legal_bases(line_a, line_b, min_overlap=1)
            if not shares:
                continue

            # Parse avg_embedding from each line
            emb_a = line_a.get("avg_embedding")
            emb_b = line_b.get("avg_embedding")

            if (
                emb_a and isinstance(emb_a, list) and len(emb_a) > 0
                and emb_b and isinstance(emb_b, list) and len(emb_b) > 0
            ):
                vec_a = np.array(emb_a, dtype=np.float32)
                vec_b = np.array(emb_b, dtype=np.float32)
                centroid_sim = _compute_cosine_similarity(vec_a, vec_b)
            else:
                centroid_sim = None

            # --- Branch detection (cross-line) ---
            # Dissimilar centroids but significant legal base overlap
            if centroid_sim is not None and centroid_sim < 0.7 and overlap_ratio > 0.3:
                event_rows.append({
                    "id": str(uuid.uuid4()),
                    "event_type": "branch",
                    "source_line_id": lid_a,
                    "target_line_id": lid_b,
                    "trigger_judgment_id": None,
                    "event_date": None,
                    "description": (
                        f"Branch detected: lines '{line_a.get('label', '')}' and "
                        f"'{line_b.get('label', '')}' share {overlap_ratio:.0%} of legal bases "
                        f"but centroid similarity is only {centroid_sim:.3f}"
                    ),
                    "confidence": round(
                        min((1.0 - centroid_sim) * overlap_ratio * 2, 1.0), 4
                    ),
                    "drift_score": round(1.0 - centroid_sim, 4),
                    "metadata": {
                        "detection_type": "cross_line_divergence",
                        "centroid_similarity": round(centroid_sim, 4),
                        "legal_base_overlap_ratio": round(overlap_ratio, 4),
                    },
                    "created_at": now,
                })
                branches_detected += 1
                logger.info(
                    f"Cross-line branch: {lid_a} <-> {lid_b}, "
                    f"sim={centroid_sim:.3f}, overlap={overlap_ratio:.2f}"
                )

            # --- Merge detection ---
            # High centroid similarity AND shared recent judgments
            members_a = line_members.get(lid_a, [])
            members_b = line_members.get(lid_b, [])

            if centroid_sim is not None and centroid_sim > 0.85:
                shared_recent = _find_shared_recent_judgments(members_a, members_b)
                if shared_recent:
                    # Use the first shared judgment as the trigger
                    trigger_id = shared_recent[0]
                    event_rows.append({
                        "id": str(uuid.uuid4()),
                        "event_type": "merge",
                        "source_line_id": lid_a,
                        "target_line_id": lid_b,
                        "trigger_judgment_id": trigger_id,
                        "event_date": None,
                        "description": (
                            f"Merge detected: lines '{line_a.get('label', '')}' and "
                            f"'{line_b.get('label', '')}' have centroid similarity "
                            f"{centroid_sim:.3f} and share {len(shared_recent)} recent judgment(s)"
                        ),
                        "confidence": round(
                            centroid_sim * min(len(shared_recent) / 3.0, 1.0), 4
                        ),
                        "drift_score": None,
                        "metadata": {
                            "detection_type": "convergence",
                            "centroid_similarity": round(centroid_sim, 4),
                            "shared_recent_judgment_ids": shared_recent[:10],
                            "shared_recent_count": len(shared_recent),
                        },
                        "created_at": now,
                    })
                    merges_detected += 1
                    logger.info(
                        f"Merge detected: {lid_a} <-> {lid_b}, "
                        f"sim={centroid_sim:.3f}, shared_recent={len(shared_recent)}"
                    )

            # --- Influence detection ---
            # Check if recent members of one line cite judgments from the other line
            ids_a = {str(m.get("id") or m.get("judgment_id")) for m in members_a}
            ids_b = {str(m.get("id") or m.get("judgment_id")) for m in members_b}

            # Influence from A to B: B's recent members reference A's judgment IDs
            shared_ids = ids_a & ids_b
            # If there are shared judgment IDs but centroids are moderately similar
            # (not high enough for merge, not low enough for branch)
            if (
                centroid_sim is not None
                and 0.5 <= centroid_sim <= 0.85
                and shared_ids
            ):
                event_rows.append({
                    "id": str(uuid.uuid4()),
                    "event_type": "influence",
                    "source_line_id": lid_a,
                    "target_line_id": lid_b,
                    "trigger_judgment_id": sorted(shared_ids)[0] if shared_ids else None,
                    "event_date": None,
                    "description": (
                        f"Influence detected: lines '{line_a.get('label', '')}' and "
                        f"'{line_b.get('label', '')}' share {len(shared_ids)} judgment(s) "
                        f"with moderate centroid similarity {centroid_sim:.3f}"
                    ),
                    "confidence": round(
                        overlap_ratio * min(len(shared_ids) / 5.0, 1.0), 4
                    ),
                    "drift_score": None,
                    "metadata": {
                        "detection_type": "cross_citation",
                        "centroid_similarity": round(centroid_sim, 4),
                        "shared_judgment_ids": sorted(shared_ids)[:10],
                        "shared_judgment_count": len(shared_ids),
                    },
                    "created_at": now,
                })
                influences_detected += 1
                logger.info(
                    f"Influence detected: {lid_a} <-> {lid_b}, "
                    f"sim={centroid_sim:.3f}, shared={len(shared_ids)}"
                )

    # Step 5: Persist all detected events to reasoning_line_events
    if event_rows:
        try:
            db.client.table("reasoning_line_events").insert(event_rows).execute()
            logger.info(
                f"Persisted {len(event_rows)} events: "
                f"{branches_detected} branches, {merges_detected} merges, "
                f"{influences_detected} influences"
            )
        except Exception as e:
            logger.error(
                f"Error persisting detected events: {e}. "
                f"Detection counts are still returned."
            )

    elapsed = round((time.time() - start_time) * 1000, 1)
    logger.info(f"Event detection completed in {elapsed}ms")

    return EventDetectionResult(
        branches_detected=branches_detected,
        merges_detected=merges_detected,
        influences_detected=influences_detected,
        lines_analyzed=len(lines),
        processing_time_ms=elapsed,
    )


@router.get(
    "/dag",
    response_model=ReasoningLineDAG,
    summary="Get full DAG structure for visualization",
    description=(
        "Returns all reasoning lines as nodes and all detected events as edges, "
        "forming a directed acyclic graph for visualization."
    ),
)
@limiter.limit(REASONING_LINES_READ_RATE_LIMIT)
async def get_dag(request: Request) -> ReasoningLineDAG:
    """
    Milestone 4 — DAG Visualization.

    Fetches all reasoning lines (active + merged) as nodes and all
    reasoning_line_events as edges, returning the full DAG structure.
    """
    db = get_vector_db()

    # Step 1: Fetch all reasoning lines as nodes
    try:
        lines_resp = (
            db.client.table("reasoning_lines")
            .select("id, label, status, case_count, coherence_score, "
                    "date_range_start, date_range_end, keywords")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning lines for DAG: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning lines")

    nodes: list[DAGNode] = []
    for row in lines_resp.data or []:
        nodes.append(
            DAGNode(
                id=str(row["id"]),
                label=row.get("label", ""),
                status=row.get("status", "active"),
                case_count=row.get("case_count", 0),
                coherence_score=row.get("coherence_score"),
                date_range_start=(
                    str(row["date_range_start"]) if row.get("date_range_start") else None
                ),
                date_range_end=(
                    str(row["date_range_end"]) if row.get("date_range_end") else None
                ),
                keywords=row.get("keywords") or [],
            )
        )

    # Step 2: Fetch all reasoning_line_events as edges
    try:
        events_resp = (
            db.client.table("reasoning_line_events")
            .select("id, event_type, source_line_id, target_line_id, "
                    "event_date, description, confidence, drift_score")
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching reasoning line events for DAG: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line events"
        )

    edges: list[DAGEdge] = []
    event_type_counts: dict[str, int] = Counter()

    for row in events_resp.data or []:
        source_id = str(row["source_line_id"]) if row.get("source_line_id") else ""
        target_id = str(row["target_line_id"]) if row.get("target_line_id") else ""

        # Skip edges with no source (should not happen, but be defensive)
        if not source_id:
            continue

        event_type = row.get("event_type", "unknown")
        event_type_counts[event_type] += 1

        edges.append(
            DAGEdge(
                id=str(row["id"]),
                event_type=event_type,
                source_id=source_id,
                target_id=target_id,
                event_date=str(row["event_date"]) if row.get("event_date") else None,
                description=row.get("description"),
                confidence=row.get("confidence"),
                drift_score=row.get("drift_score"),
            )
        )

    # Step 3: Build statistics summary
    statistics: dict[str, Any] = {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "by_event_type": dict(event_type_counts),
        "by_status": dict(Counter(n.status for n in nodes)),
    }

    logger.info(
        f"DAG built: {len(nodes)} nodes, {len(edges)} edges, "
        f"event types: {dict(event_type_counts)}"
    )

    return ReasoningLineDAG(
        nodes=nodes,
        edges=edges,
        statistics=statistics,
    )

"""Pydantic request/response models for the Reasoning Line Tracker API (#147 split)."""

from typing import Any

from pydantic import BaseModel, Field

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


# ===== Milestone 4: Branch/Merge Event & DAG Models =====


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

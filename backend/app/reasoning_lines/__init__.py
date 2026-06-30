"""Reasoning Line Tracker API package.

Split from the former 3032-LOC ``app/reasoning_lines.py`` monolith (#147).
Public surface is unchanged: import ``router`` for FastAPI mounting, and the
pure helpers remain importable from ``app.reasoning_lines`` for the test suite.
"""

from fastapi import APIRouter

from . import crud, discovery, drift, events, outcomes, search, timeline
from .event_detection import (
    _build_cross_branch_event,
    _build_influence_event,
    _build_merge_event,
    _collect_cross_line_pair_events,
    _collect_internal_branch_events,
    _detect_internal_branch,
    _find_shared_recent_judgments,
)
from .schemas import (
    CreateReasoningLineRequest,
    DAGEdge,
    DAGNode,
    DiscoveredCase,
    DiscoveredCluster,
    DriftAnalysisResponse,
    DriftPeak,
    DriftWindow,
    EventDetectionResult,
    OutcomeClassificationResult,
    ReasoningLineDAG,
    ReasoningLineDetail,
    ReasoningLineDiscoveryRequest,
    ReasoningLineDiscoveryResponse,
    ReasoningLineMember,
    ReasoningLineSearchRequest,
    ReasoningLineSearchResponse,
    ReasoningLineSearchResult,
    ReasoningLineSummary,
    ReasoningLineTimeline,
    RelatedLinesResponse,
    RelatedReasoningLine,
    TimelinePoint,
    VisualizationEdge,
    VisualizationNode,
)
from .similarity import (
    _compute_cosine_similarity,
    _cosine_similarity,
    _extract_legal_bases,
    _jaccard_similarity,
    _lines_share_legal_bases,
    _pair_centroid_similarity,
    _text_overlap_score,
    _tokenize,
)
from .timeline_math import (
    _bucket_members_by_period,
    _compute_date_range,
    _detect_timeline_trend,
    _extract_window_keywords,
)

router = APIRouter(prefix="/reasoning-lines", tags=["reasoning-lines"])
router.include_router(discovery.router)
router.include_router(crud.router)
router.include_router(outcomes.router)
router.include_router(timeline.router)
router.include_router(drift.router)
router.include_router(search.router)
router.include_router(events.router)

__all__ = [
    "CreateReasoningLineRequest",
    "DAGEdge",
    "DAGNode",
    "DiscoveredCase",
    "DiscoveredCluster",
    "DriftAnalysisResponse",
    "DriftPeak",
    "DriftWindow",
    "EventDetectionResult",
    "OutcomeClassificationResult",
    "ReasoningLineDAG",
    "ReasoningLineDetail",
    "ReasoningLineDiscoveryRequest",
    "ReasoningLineDiscoveryResponse",
    "ReasoningLineMember",
    "ReasoningLineSearchRequest",
    "ReasoningLineSearchResponse",
    "ReasoningLineSearchResult",
    "ReasoningLineSummary",
    "ReasoningLineTimeline",
    "RelatedLinesResponse",
    "RelatedReasoningLine",
    "TimelinePoint",
    "VisualizationEdge",
    "VisualizationNode",
    "_bucket_members_by_period",
    "_build_cross_branch_event",
    "_build_influence_event",
    "_build_merge_event",
    "_collect_cross_line_pair_events",
    "_collect_internal_branch_events",
    "_compute_cosine_similarity",
    "_compute_date_range",
    "_cosine_similarity",
    "_detect_internal_branch",
    "_detect_timeline_trend",
    "_extract_legal_bases",
    "_extract_window_keywords",
    "_find_shared_recent_judgments",
    "_jaccard_similarity",
    "_lines_share_legal_bases",
    "_pair_centroid_similarity",
    "_text_overlap_score",
    "_tokenize",
    "router",
]

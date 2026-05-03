/**
 * Types for the Reasoning Line Tracker feature.
 * Milestone 1: Discovery (POST /reasoning-lines/discover)
 * Milestone 2: Persistence & Detail (CRUD endpoints)
 * Milestone 3: Timeline & Drift Analysis
 * Milestone 4: DAG Visualization
 * Milestone 6: Semantic Search & Related Lines
 * Milestone 7: Pipeline Status
 */

// ---------------------------------------------------------------------------
// Milestone 1 — Discovery types
// ---------------------------------------------------------------------------

/** A single case returned within a discovered cluster */
export interface DiscoveredCase {
  judgment_id: string;
  signature: string;
  title: string;
  court_name: string;
  decision_date: string;
  similarity_to_centroid: number;
  cited_legislation: string[];
}

/** A cluster of judgments addressing the same legal question */
export interface DiscoveredCluster {
  cluster_id: number;
  label: string;
  keywords: string[];
  legal_bases: string[];
  case_count: number;
  coherence_score: number;
  date_range: {
    start: string;
    end: string;
  };
  top_cases: DiscoveredCase[];
}

/** Aggregate statistics for the discovery run */
export interface DiscoveryStatistics {
  total_documents: number;
  num_clusters: number;
  avg_coherence: number;
  processing_time_ms: number;
}

/** A node in the 2D cluster visualization */
export interface VisualizationNode {
  id: string;
  title: string;
  x: number;
  y: number;
  cluster_id: number;
}

/** An edge between two nodes in the visualization */
export interface VisualizationEdge {
  source: string;
  target: string;
  similarity: number;
}

/** Full response from POST /reasoning-lines/discover */
export interface DiscoveryResponse {
  clusters: DiscoveredCluster[];
  statistics: DiscoveryStatistics;
  visualization: {
    nodes: VisualizationNode[];
    edges: VisualizationEdge[];
  };
}

/** Parameters for the discovery request */
export interface DiscoveryParams {
  sample_size: number;
  num_clusters: number;
  legal_domain_filter?: string | null;
  min_shared_legal_bases?: number;
}

// ---------------------------------------------------------------------------
// Milestone 2 — Persistence & Detail types
// ---------------------------------------------------------------------------

/** Status of a saved reasoning line */
export type ReasoningLineStatus = 'active' | 'archived' | 'deleted';

/** Summary of a saved reasoning line (returned by GET /reasoning-lines/) */
export interface ReasoningLineSummary {
  id: string;
  label: string;
  legal_question: string;
  keywords: string[];
  legal_bases: string[];
  status: ReasoningLineStatus;
  case_count: number;
  coherence_score: number;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
}

/** A single member judgment within a reasoning line */
export interface ReasoningLineMember {
  judgment_id: string;
  signature: string;
  title: string;
  court_name: string;
  decision_date: string;
  position_in_line: number;
  similarity_to_centroid: number;
  reasoning_pattern: string | null;
  outcome_direction: string | null;
}

/** Full detail of a reasoning line (returned by GET /reasoning-lines/{id}) */
export interface ReasoningLineDetail {
  id: string;
  label: string;
  legal_question: string;
  keywords: string[];
  legal_bases: string[];
  status: ReasoningLineStatus;
  case_count: number;
  coherence_score: number;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
  updated_at: string;
  members: ReasoningLineMember[];
}

/** Request body for POST /reasoning-lines/create */
export interface CreateReasoningLineRequest {
  label: string;
  legal_question: string;
  keywords: string[];
  legal_bases: string[];
  judgment_ids: string[];
  coherence_score: number;
}

/** Response from DELETE /reasoning-lines/{id} */
export interface DeleteReasoningLineResponse {
  status: string;
  id: string;
}

// ---------------------------------------------------------------------------
// Milestone 3 — Timeline & Drift Analysis types
// ---------------------------------------------------------------------------

/** A single data point in the outcome timeline */
export interface TimelinePoint {
  period_label: string;
  start_date: string;
  end_date: string;
  total: number;
  for_count: number;
  against_count: number;
  mixed_count: number;
  procedural_count: number;
  unclassified_count: number;
  for_ratio: number;
}

/** Full timeline response from GET /reasoning-lines/{id}/timeline */
export interface ReasoningLineTimeline {
  line_id: string;
  legal_question: string;
  points: TimelinePoint[];
  trend: string;
  trend_slope: number;
  total_classified: number;
  total_unclassified: number;
}

/** A single window in the drift analysis */
export interface DriftWindow {
  window_index: number;
  period_start: string;
  period_end: string;
  case_count: number;
  drift_score: number;
  top_keywords: string[];
  entering_keywords: string[];
  exiting_keywords: string[];
}

/** A peak drift event */
export interface DriftPeak {
  window_index: number;
  drift_score: number;
  period_start: string;
  period_end: string;
  entering_keywords: string[];
  exiting_keywords: string[];
}

/** Full drift analysis response from POST /reasoning-lines/{id}/drift-analysis */
export interface DriftAnalysisResponse {
  line_id: string;
  legal_question: string;
  windows: DriftWindow[];
  peaks: DriftPeak[];
  avg_drift: number;
  max_drift: number;
  drift_events_created: number;
  total_members_analyzed: number;
}

/** Response from POST /reasoning-lines/{id}/analyze-outcomes */
export interface OutcomeClassificationResult {
  classified: number;
  skipped: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Milestone 4 — DAG Visualization types
// ---------------------------------------------------------------------------

/** Status of a node in the DAG visualization */
export type DAGNodeStatus = 'active' | 'merged' | 'superseded' | 'dormant';

/** A node in the reasoning line DAG */
export interface DAGNode {
  id: string;
  label: string;
  status: DAGNodeStatus;
  case_count: number;
  coherence_score: number;
  date_range_start: string;
  date_range_end: string;
  keywords: string[];
}

/** Type of edge event in the DAG */
export type DAGEdgeEventType = 'branch' | 'merge' | 'influence' | 'drift';

/** An edge in the reasoning line DAG */
export interface DAGEdge {
  id: string;
  event_type: DAGEdgeEventType;
  source_id: string;
  target_id: string;
  event_date: string;
  description: string;
  confidence: number;
  drift_score: number | null;
}

/** DAG statistics returned by the API */
export interface DAGStatistics {
  total_nodes: number;
  total_edges: number;
}

/** Full response from GET /reasoning-lines/dag */
export interface ReasoningLineDAG {
  nodes: DAGNode[];
  edges: DAGEdge[];
  statistics: DAGStatistics;
}

/** Response from POST /reasoning-lines/detect-events */
export interface EventDetectionResult {
  branches_detected: number;
  merges_detected: number;
  influences_detected: number;
  lines_analyzed: number;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// Milestone 6 — Semantic Search & Related Lines types
// ---------------------------------------------------------------------------

/** A single search result from semantic search */
export interface SearchResult {
  id: string;
  label: string;
  legal_question: string;
  keywords: string[];
  legal_bases: string[];
  case_count: number;
  coherence_score: number;
  similarity: number;
}

/** Full response from POST /reasoning-lines/search */
export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total_found: number;
}

/** A related reasoning line returned by the related lines API */
export interface RelatedLine {
  id: string;
  label: string;
  legal_question: string;
  keywords: string[];
  case_count: number;
  relatedness_score: number;
  shared_legal_bases: string[];
  shared_keywords: string[];
}

/** Full response from GET /reasoning-lines/{id}/related */
export interface RelatedLinesResponse {
  line_id: string;
  related: RelatedLine[];
}

// ---------------------------------------------------------------------------
// Milestone 7 — Pipeline Status types
// ---------------------------------------------------------------------------

/** Result summary from a Celery pipeline task execution */
export interface PipelineTaskResult {
  assigned?: number;
  unassigned_remaining?: number;
  lines_updated?: number;
  lines_created?: number;
  judgments_assigned?: number;
  clusters_rejected?: number;
  branches?: number;
  merges?: number;
  lines_analyzed?: number;
}

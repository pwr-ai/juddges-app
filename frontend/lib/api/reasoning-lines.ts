import { apiLogger } from './client';
import type {
  DiscoveryParams,
  DiscoveryResponse,
  CreateReasoningLineRequest,
  ReasoningLineDetail,
  ReasoningLineSummary,
  ReasoningLineStatus,
  DeleteReasoningLineResponse,
  ReasoningLineTimeline,
  DriftAnalysisResponse,
  OutcomeClassificationResult,
  ReasoningLineDAG,
  EventDetectionResult,
  SearchResponse,
  RelatedLinesResponse,
} from '@/types/reasoning-lines';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

/**
 * Discover reasoning line clusters from the judgment corpus.
 * POST /reasoning-lines/discover
 */
export async function discoverReasoningLines(
  params: DiscoveryParams
): Promise<DiscoveryResponse> {
  apiLogger.info('discoverReasoningLines called', { params });

  const response = await fetch(`${API_BASE}/reasoning-lines/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to discover reasoning lines' }));
    apiLogger.error('Discover reasoning lines API error:', response.status, errorData);
    throw new Error('Nie udalo sie odkryc linii orzeczniczych. Sprobuj ponownie.');
  }

  return response.json();
}

/**
 * Save a discovered cluster as a persistent reasoning line.
 * POST /reasoning-lines/create
 */
export async function createReasoningLine(
  params: CreateReasoningLineRequest
): Promise<ReasoningLineDetail> {
  apiLogger.info('createReasoningLine called', { label: params.label });

  const response = await fetch(`${API_BASE}/reasoning-lines/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to create reasoning line' }));
    apiLogger.error('Create reasoning line API error:', response.status, errorData);
    throw new Error('Nie udalo sie zapisac linii orzeczniczej. Sprobuj ponownie.');
  }

  return response.json();
}

/**
 * List saved reasoning lines with optional filters.
 * GET /reasoning-lines/?status=active&limit=50&offset=0
 */
export async function listReasoningLines(
  status?: ReasoningLineStatus,
  limit: number = 50,
  offset: number = 0
): Promise<ReasoningLineSummary[]> {
  apiLogger.info('listReasoningLines called', { status, limit, offset });

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  const response = await fetch(`${API_BASE}/reasoning-lines/?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to list reasoning lines' }));
    apiLogger.error('List reasoning lines API error:', response.status, errorData);
    throw new Error('Nie udalo sie pobrac zapisanych linii orzeczniczych.');
  }

  return response.json();
}

/**
 * Get full detail of a reasoning line including its member judgments.
 * GET /reasoning-lines/{id}
 */
export async function getReasoningLineDetail(
  id: string
): Promise<ReasoningLineDetail> {
  apiLogger.info('getReasoningLineDetail called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to get reasoning line detail' }));
    apiLogger.error('Get reasoning line detail API error:', response.status, errorData);
    throw new Error('Nie udalo sie pobrac szczegulow linii orzeczniczej.');
  }

  return response.json();
}

/**
 * Delete a reasoning line.
 * DELETE /reasoning-lines/{id}
 */
export async function deleteReasoningLine(
  id: string
): Promise<DeleteReasoningLineResponse> {
  apiLogger.info('deleteReasoningLine called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to delete reasoning line' }));
    apiLogger.error('Delete reasoning line API error:', response.status, errorData);
    throw new Error('Nie udalo sie usunac linii orzeczniczej.');
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Milestone 3 — Timeline & Drift Analysis
// ---------------------------------------------------------------------------

/**
 * Get the outcome timeline for a reasoning line.
 * GET /reasoning-lines/{id}/timeline
 */
export async function getReasoningLineTimeline(
  id: string
): Promise<ReasoningLineTimeline> {
  apiLogger.info('getReasoningLineTimeline called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}/timeline`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to get reasoning line timeline' }));
    apiLogger.error('Get reasoning line timeline API error:', response.status, errorData);
    throw new Error('Nie udalo sie pobrac osi czasu linii orzeczniczej.');
  }

  return response.json();
}

/**
 * Trigger drift analysis for a reasoning line.
 * POST /reasoning-lines/{id}/drift-analysis
 */
export async function analyzeReasoningLineDrift(
  id: string
): Promise<DriftAnalysisResponse> {
  apiLogger.info('analyzeReasoningLineDrift called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}/drift-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to analyze drift' }));
    apiLogger.error('Analyze reasoning line drift API error:', response.status, errorData);
    throw new Error('Nie udalo sie przeanalizowac dryfu jezykowego.');
  }

  return response.json();
}

/**
 * Classify outcomes for judgments in a reasoning line.
 * POST /reasoning-lines/{id}/analyze-outcomes
 */
export async function classifyOutcomes(
  id: string
): Promise<OutcomeClassificationResult> {
  apiLogger.info('classifyOutcomes called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}/analyze-outcomes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to classify outcomes' }));
    apiLogger.error('Classify outcomes API error:', response.status, errorData);
    throw new Error('Nie udalo sie sklasyfikowac orzeczen.');
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Milestone 4 — DAG Visualization
// ---------------------------------------------------------------------------

/**
 * Fetch the DAG (Directed Acyclic Graph) of reasoning lines.
 * GET /reasoning-lines/dag
 */
export async function getReasoningLineDAG(): Promise<ReasoningLineDAG> {
  apiLogger.info('getReasoningLineDAG called');

  const response = await fetch(`${API_BASE}/reasoning-lines/dag`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to fetch reasoning line DAG' }));
    apiLogger.error('Get reasoning line DAG API error:', response.status, errorData);
    throw new Error('Nie udalo sie pobrac grafu DAG linii orzeczniczych.');
  }

  return response.json();
}

/**
 * Detect branching, merging, and influence events between reasoning lines.
 * POST /reasoning-lines/detect-events
 */
export async function detectEvents(): Promise<EventDetectionResult> {
  apiLogger.info('detectEvents called');

  const response = await fetch(`${API_BASE}/reasoning-lines/detect-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to detect events' }));
    apiLogger.error('Detect events API error:', response.status, errorData);
    throw new Error('Nie udalo sie wykryc zdarzen miedzy liniami orzeczniczymi.');
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Milestone 6 — Semantic Search & Related Lines
// ---------------------------------------------------------------------------

/**
 * Search reasoning lines by semantic similarity.
 * POST /reasoning-lines/search
 */
export async function searchReasoningLines(
  query: string,
  limit: number = 10,
  minSimilarity: number = 0.3
): Promise<SearchResponse> {
  apiLogger.info('searchReasoningLines called', { query, limit, minSimilarity });

  const response = await fetch(`${API_BASE}/reasoning-lines/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit,
      min_similarity: minSimilarity,
    }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to search reasoning lines' }));
    apiLogger.error('Search reasoning lines API error:', response.status, errorData);
    throw new Error('Nie udalo sie wyszukac linii orzeczniczych.');
  }

  return response.json();
}

/**
 * Get reasoning lines related to a given line.
 * GET /reasoning-lines/{id}/related
 */
export async function getRelatedLines(
  id: string
): Promise<RelatedLinesResponse> {
  apiLogger.info('getRelatedLines called', { id });

  const response = await fetch(`${API_BASE}/reasoning-lines/${id}/related`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Failed to get related lines' }));
    apiLogger.error('Get related lines API error:', response.status, errorData);
    throw new Error('Nie udalo sie pobrac powiazanych linii orzeczniczych.');
  }

  return response.json();
}

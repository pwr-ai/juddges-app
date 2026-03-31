import { apiLogger } from './client';

// Document summarization

export interface SummarizeDocumentsInput {
  document_ids: string[];
  summary_type?: "executive" | "key_findings" | "synthesis";
  length?: "short" | "medium" | "long";
  focus_areas?: string[];
}

export interface SummarizeDocumentsResponse {
  summary: string;
  key_points: string[];
  document_ids: string[];
  summary_type: string;
  length: string;
}

export async function summarizeDocuments(
  input: SummarizeDocumentsInput
): Promise<SummarizeDocumentsResponse> {
  apiLogger.info('summarizeDocuments called', {
    documentIds: input.document_ids,
    summaryType: input.summary_type,
    length: input.length,
  });

  const response = await fetch(`/api/documents/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to summarize documents' }));
    apiLogger.error('Summarize documents API error:', response.status, errorData);
    throw new Error('Failed to generate summary. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('summarizeDocuments response', {
    summaryLength: result.summary?.length,
    keyPointsCount: result.key_points?.length,
  });

  return result;
}

// Key points extraction

export interface KeyPointArgument {
  party: string;
  text: string;
  source_ref: string;
}

export interface KeyPointHolding {
  text: string;
  source_ref: string;
}

export interface KeyPointLegalPrinciple {
  text: string;
  source_ref: string;
  legal_basis: string | null;
}

export interface ExtractKeyPointsInput {
  document_id: string;
  focus_areas?: string[];
}

export interface ExtractKeyPointsResponse {
  arguments: KeyPointArgument[];
  holdings: KeyPointHolding[];
  legal_principles: KeyPointLegalPrinciple[];
  document_id: string;
}

export async function extractKeyPoints(
  input: ExtractKeyPointsInput
): Promise<ExtractKeyPointsResponse> {
  apiLogger.info('extractKeyPoints called', {
    documentId: input.document_id,
    focusAreas: input.focus_areas,
  });

  const response = await fetch(`/api/documents/key-points`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to extract key points' }));
    apiLogger.error('Extract key points API error:', response.status, errorData);
    throw new Error('Failed to extract key points. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('extractKeyPoints response', {
    argumentCount: result.arguments?.length,
    holdingCount: result.holdings?.length,
    principleCount: result.legal_principles?.length,
  });

  return result;
}

// Precedent finder

export interface PrecedentFilters {
  document_types?: string[];
  court_names?: string[];
  date_from?: string;
  date_to?: string;
  legal_bases?: string[];
  outcome?: string;
  language?: string;
}

export interface FindPrecedentsInput {
  query: string;
  document_id?: string;
  filters?: PrecedentFilters;
  limit?: number;
  include_analysis?: boolean;
}

export interface PrecedentMatch {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  court_name: string | null;
  outcome: string | null;
  legal_bases: string[] | null;
  summary: string | null;
  similarity_score: number;
  relevance_score: number | null;
  matching_factors: string[];
  relevance_explanation: string | null;
}

export interface FindPrecedentsResponse {
  query: string;
  precedents: PrecedentMatch[];
  total_found: number;
  search_strategy: string;
  enhanced_query: string | null;
}

export async function findPrecedents(
  input: FindPrecedentsInput
): Promise<FindPrecedentsResponse> {
  apiLogger.info('findPrecedents called', {
    queryLength: input.query.length,
    documentId: input.document_id,
    limit: input.limit,
    includeAnalysis: input.include_analysis,
  });

  const response = await fetch(`/api/precedents/find`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to find precedents' }));
    apiLogger.error('Find precedents API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to find precedents. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('findPrecedents response', {
    precedentCount: result.precedents?.length,
    totalFound: result.total_found,
    searchStrategy: result.search_strategy,
  });

  return result;
}

// Citation Network

export interface CitationNetworkInput {
  sample_size?: number;
  min_shared_refs?: number;
  document_types?: string[];
}

export interface CitationNetworkResponse {
  nodes: Array<{
    id: string;
    title: string;
    document_type: string;
    year: number | null;
    x: number;
    y: number;
    citation_count: number;
    authority_score: number;
    references: string[];
    metadata: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    shared_refs: string[];
    weight: number;
  }>;
  statistics: {
    total_nodes: number;
    total_edges: number;
    avg_citations: number;
    max_citations: number;
    most_cited_refs: Array<{ reference: string; count: number }>;
    avg_authority_score: number;
  };
}

export async function getCitationNetwork(
  input?: CitationNetworkInput
): Promise<CitationNetworkResponse> {
  const params = new URLSearchParams();
  if (input?.sample_size) params.set('sample_size', input.sample_size.toString());
  if (input?.min_shared_refs) params.set('min_shared_refs', input.min_shared_refs.toString());
  if (input?.document_types?.length) params.set('document_types', input.document_types.join(','));

  const url = `/api/documents/citation-network${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch citation network' }));
    apiLogger.error('Citation network API error:', response.status, errorData);
    throw new Error('Failed to load citation network. Please try again.');
  }

  return await response.json();
}

// Argumentation Analysis

export interface AnalyzeArgumentsInput {
  document_ids: string[];
  focus_areas?: string[];
  detail_level?: "basic" | "detailed";
}

export interface ArgumentResult {
  title: string;
  party: string;
  factual_premises: string[];
  legal_premises: string[];
  conclusion: string;
  reasoning_pattern: "deductive" | "analogical" | "policy" | "textual" | "teleological";
  strength: "strong" | "moderate" | "weak";
  strength_explanation: string;
  counter_arguments: string[];
  legal_references: string[];
  source_section: string | null;
}

export interface AnalyzeArgumentsResponse {
  arguments: ArgumentResult[];
  overall_analysis: {
    dominant_reasoning_pattern: string;
    argument_flow: string;
    key_disputes: string[];
    strongest_argument_index: number;
  };
  document_ids: string[];
  argument_count: number;
}

export async function analyzeArguments(
  input: AnalyzeArgumentsInput
): Promise<AnalyzeArgumentsResponse> {
  apiLogger.info("analyzeArguments called", {
    documentIds: input.document_ids,
    detailLevel: input.detail_level,
  });

  const response = await fetch("/api/argumentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to analyze arguments" }));
    apiLogger.error("Argumentation API error: ", response.status, errorData);
    throw new Error(
      errorData.error || "Failed to analyze arguments. Please try again."
    );
  }

  const result = await response.json();
  apiLogger.info("analyzeArguments response", {
    argumentCount: result.argument_count,
  });

  return result;
}

// Timeline Extraction

export interface TimelineExtractionInput {
  document_ids: string[];
  extraction_depth?: "basic" | "detailed" | "comprehensive";
  focus_areas?: string[];
}

export interface TimelineEvent {
  date: string;
  date_precision: "day" | "month" | "year";
  title: string;
  description: string;
  category: "filing" | "decision" | "deadline" | "hearing" | "appeal" | "enforcement" | "procedural" | "legislative" | "other";
  parties: string[];
  legal_references: string[];
  importance: "high" | "medium" | "low";
}

export interface TimelineDateRange {
  earliest: string | null;
  latest: string | null;
}

export interface TimelineExtractionResponse {
  events: TimelineEvent[];
  timeline_summary: string;
  date_range: TimelineDateRange;
  document_ids: string[];
  total_events: number;
  extraction_depth: string;
}

export async function extractTimeline(
  input: TimelineExtractionInput
): Promise<TimelineExtractionResponse> {
  apiLogger.info('extractTimeline called', {
    documentIds: input.document_ids,
    extractionDepth: input.extraction_depth,
  });

  const response = await fetch('/api/documents/timeline', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to extract timeline' }));
    apiLogger.error('Timeline extraction API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to extract timeline. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('extractTimeline response', {
    eventCount: result.total_events,
    extractionDepth: result.extraction_depth,
  });

  return result;
}

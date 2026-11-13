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

/** One raw vector candidate returned before the AI ranking pass (#724). */
export interface PrecedentCohortItem {
  document_id: string;
  similarity_score: number;
  case_number: string | null;
  title: string | null;
  jurisdiction: string | null;
  court_name: string | null;
  decision_date: string | null;
  appeal_outcome: string[];
  sentences_received: string[];
  convict_offences: string[];
}

/** A case number typed into the query box, resolved to a judgment (#724). */
export interface ResolvedCase {
  case_number: string;
  document_id: string;
  title: string | null;
}

export interface FindPrecedentsResponse {
  query: string;
  precedents: PrecedentMatch[];
  total_found: number;
  search_strategy: string;
  enhanced_query: string | null;
  cohort: PrecedentCohortItem[];
  resolved_case: ResolvedCase | null;
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

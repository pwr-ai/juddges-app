/**
 * API client module for the Juddges frontend.
 *
 * All functions make real HTTP requests to the backend via
 * `NEXT_PUBLIC_API_BASE_URL`. The streaming helper (`streamChatQuestion`)
 * uses the Fetch Streaming API to deliver tokens incrementally.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Standard JSON POST request to the backend API. */
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

/** Standard JSON GET request to the backend API. */
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

/** Standard JSON PUT request to the backend API. */
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// -- Pagination --

export interface PaginationMetadata {
  offset: number;
  limit?: number;
  loaded_count: number;
  estimated_total: number | null;
  has_more: boolean;
  next_offset: number | null;
}

// -- Chat / Streaming --

export interface DocumentRetrievalInput {
  question: string;
  chat_history?: Array<{ content: string; role: "human" | "ai" }>;
  max_documents?: number;
  response_format?: "short" | "detailed" | "adaptive";
}

// -- Search --

interface SearchChunksParams {
  query: string;
  limit_docs?: number;
  alpha?: number;
  languages?: string[];
  document_types?: string[];
  fetch_full_documents?: boolean;
  limit_chunks?: number;
  mode?: string;
  offset?: number;
  include_count?: boolean;
}

interface SearchChunksResponse {
  chunks: Array<{
    chunk_id: string;
    document_id: string;
    document_type?: string;
    language?: string;
    score?: number;
    confidence_score?: number;
    tags?: string | string[];
    [key: string]: unknown;
  }>;
  unique_documents: number;
  query_time_ms: number;
  pagination?: PaginationMetadata;
}

interface FetchDocumentsParams {
  document_ids: string[];
  return_properties?: string[];
}

interface FetchDocumentsResponse {
  documents: Array<{
    document_id: string;
    document_type?: string;
    title?: string | null;
    date_issued?: string | null;
    issuing_body?: string | null;
    language?: string | null;
    document_number?: string | null;
    country?: string | null;
    full_text?: string | null;
    summary?: string | null;
    thesis?: string | null;
    legal_references?: unknown[] | null;
    legal_concepts?: unknown[] | null;
    keywords?: string[] | null;
    court_name?: string | null;
    department_name?: string | null;
    presiding_judge?: string | null;
    judges?: string[] | null;
    parties?: string | null;
    outcome?: string | null;
    legal_bases?: string[] | null;
    extracted_legal_bases?: string | null;
    references?: string[] | null;
    factual_state?: string | null;
    legal_state?: string | null;
    score?: number | null;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
}

// -- Summarization --

export interface SummarizeDocumentsResponse {
  summary: string;
  key_points: string[];
  document_ids: string[];
}

// -- Key Points Extraction --

export interface ExtractKeyPointsResponse {
  arguments: Array<{ title: string; description: string; party?: string; text?: string; source_ref?: string }>;
  holdings: Array<{ title: string; description: string; principle?: string; text?: string; source_ref?: string }>;
  legal_principles: Array<{ title: string; description: string; principle?: string; text?: string; source_ref?: string; legal_basis?: string }>;
  document_id: string;
}

// -- Precedents --

export interface PrecedentMatch {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  court_name: string | null;
  summary: string | null;
  outcome: string | null;
  legal_bases: string[] | null;
  similarity_score: number;
  relevance_score: number;
  relevance_explanation: string | null;
  matching_factors: string[];
}

export interface FindPrecedentsResponse {
  precedents: PrecedentMatch[];
  total_found: number;
  enhanced_query: string | null;
  search_strategy: string;
}

// -- Argumentation Analysis --

export interface ArgumentResult {
  title: string;
  party: string;
  reasoning_pattern: string;
  strength: "strong" | "moderate" | "weak";
  strength_explanation: string;
  conclusion: string;
  factual_premises: string[];
  legal_premises: string[];
  counter_arguments: string[];
  legal_references: string[];
  source_section: string | null;
}

export interface AnalyzeArgumentsResponse {
  arguments: ArgumentResult[];
  argument_count: number;
  document_ids: string[];
  overall_analysis: {
    dominant_reasoning_pattern: string;
    argument_flow: string;
    key_disputes: string[];
    strongest_argument_index: number;
  };
}

// -- Bulk Extraction --

export interface BulkExtractionJobInfo {
  job_id: string;
  schema_id: string;
  schema_name: string | null;
  status: "accepted" | "rejected";
  message: string;
}

export interface BulkExtractionResponse {
  message: string;
  jobs: BulkExtractionJobInfo[];
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

// -- Chat Streaming --

/**
 * Stream a chat question to the backend and deliver tokens via callbacks.
 *
 * Uses the Fetch streaming API to parse newline-delimited JSON events from
 * the backend's `/api/chat/stream` endpoint. Events can be:
 * - `{ token: string }` -- partial text
 * - `{ complete: true, text: string, document_ids?: string[] }` -- final event
 * - `{ error: string }` -- error event
 */
export async function streamChatQuestion(
  input: DocumentRetrievalInput,
  callbacks: {
    onToken: (token: string) => void;
    onComplete: (fullText: string, documentIds?: string[]) => void;
    onError: (error: Error) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Chat stream error ${res.status}: ${detail}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body for streaming");
  }

  const decoder = new TextDecoder();
  let accumulatedText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process newline-delimited JSON events
      const lines = buffer.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);

          if (event.error) {
            callbacks.onError(new Error(event.error));
            return;
          }

          if (event.complete) {
            callbacks.onComplete(
              event.text ?? accumulatedText,
              event.document_ids
            );
            return;
          }

          if (event.token !== undefined) {
            accumulatedText += event.token;
            callbacks.onToken(accumulatedText);
          }
        } catch {
          // If the line isn't valid JSON, treat it as a raw text token
          accumulatedText += trimmed;
          callbacks.onToken(accumulatedText);
        }
      }
    }

    // If we reach here without a `complete` event, call onComplete with what we have
    if (accumulatedText) {
      callbacks.onComplete(accumulatedText);
    }
  } finally {
    reader.releaseLock();
  }
}

// -- Example Questions --

/**
 * Fetch example chat questions from the backend.
 * @param polishCount Number of Polish-language questions to request
 * @param englishCount Number of English-language questions to request
 */
export async function getExampleQuestions(
  polishCount = 20,
  englishCount = 20
): Promise<string[]> {
  const data = await apiGet<{ questions: string[] }>(
    `chat/example-questions?polish=${polishCount}&english=${englishCount}`
  );
  return data.questions;
}

// -- Search --

/**
 * Search for document chunks matching a query.
 * This is phase 1 of the two-phase search flow (chunks -> documents).
 */
export async function searchChunks(
  params: SearchChunksParams
): Promise<SearchChunksResponse> {
  return apiPost<SearchChunksResponse>("search/chunks", params);
}

/**
 * Fetch full document metadata by IDs.
 * This is phase 2 of the two-phase search flow.
 */
export async function fetchDocumentsByIds(
  params: FetchDocumentsParams
): Promise<FetchDocumentsResponse> {
  return apiPost<FetchDocumentsResponse>("documents/by-ids", params);
}

// -- Summarization --

/**
 * Generate an AI summary for one or more documents.
 */
export async function summarizeDocuments(params: {
  document_ids: string[];
  summary_type?: "executive" | "key_findings" | "synthesis";
  length?: "short" | "medium" | "long";
}): Promise<SummarizeDocumentsResponse> {
  return apiPost<SummarizeDocumentsResponse>("documents/summarize", params);
}

// -- Key Points Extraction --

/**
 * Extract key arguments, holdings, and legal principles from a document.
 */
export async function extractKeyPoints(params: {
  document_id: string;
}): Promise<ExtractKeyPointsResponse> {
  return apiPost<ExtractKeyPointsResponse>("documents/extract-key-points", params);
}

// -- Precedent Finder --

/**
 * Find relevant precedent cases using AI-powered semantic search.
 */
export async function findPrecedents(params: {
  query: string;
  limit?: number;
  include_analysis?: boolean;
  filters?: Record<string, unknown>;
}): Promise<FindPrecedentsResponse> {
  return apiPost<FindPrecedentsResponse>("precedents/find", params);
}

// -- Argumentation Analysis --

/**
 * Analyze legal arguments in documents identifying premises, conclusions,
 * reasoning patterns, and counter-arguments.
 */
export async function analyzeArguments(params: {
  document_ids: string[];
  focus_areas?: string[];
  detail_level?: "basic" | "detailed";
}): Promise<AnalyzeArgumentsResponse> {
  return apiPost<AnalyzeArgumentsResponse>("analysis/arguments", params);
}

// -- Version History --

/**
 * Get version history for a document.
 */
export async function getVersionHistory(
  documentId: string
): Promise<import("@/types/versioning").VersionHistoryResponse> {
  return apiGet<import("@/types/versioning").VersionHistoryResponse>(
    `documents/${documentId}/versions`
  );
}

/**
 * Get a diff between two versions of a document.
 */
export async function getVersionDiff(
  documentId: string,
  fromVersion: number,
  toVersion: number
): Promise<import("@/types/versioning").VersionDiffResponse> {
  return apiGet<import("@/types/versioning").VersionDiffResponse>(
    `documents/${documentId}/versions/diff?from=${fromVersion}&to=${toVersion}`
  );
}

/**
 * Create a version snapshot for a document.
 */
export async function createVersionSnapshot(
  documentId: string,
  input: import("@/types/versioning").CreateVersionInput
): Promise<void> {
  await apiPost<unknown>(`documents/${documentId}/versions`, input);
}

/**
 * Revert a document to a specific version.
 */
export async function revertToVersion(
  documentId: string,
  input: import("@/types/versioning").RevertVersionInput
): Promise<import("@/types/versioning").RevertVersionResponse> {
  return apiPost<import("@/types/versioning").RevertVersionResponse>(
    `documents/${documentId}/versions/revert`,
    input
  );
}

// -- Bulk Extraction --

/**
 * Submit a bulk extraction job for a collection of documents.
 */
export async function submitBulkExtraction(params: {
  collection_id: string;
  schema_ids: string[];
  document_ids: string[];
  language: string;
  auto_export?: boolean;
}): Promise<BulkExtractionResponse> {
  return apiPost<BulkExtractionResponse>("extractions/bulk", params);
}

// -- Schema Marketplace --

/**
 * Browse marketplace listings with optional search, category filter, and sorting.
 */
export async function browseMarketplaceListings(params: {
  search?: string;
  category?: string;
  sort_by?: string;
  page?: number;
  page_size?: number;
}): Promise<{
  listings: import("@/types/marketplace").MarketplaceListingItem[];
  total_count: number;
  has_more: boolean;
}> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.sort_by) query.set("sort_by", params.sort_by);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  return apiGet<{
    listings: import("@/types/marketplace").MarketplaceListingItem[];
    total_count: number;
    has_more: boolean;
  }>(`marketplace/listings${qs ? `?${qs}` : ""}`);
}

/**
 * Download a schema from the marketplace. Returns the schema definition.
 */
export async function downloadMarketplaceSchema(
  listingId: string
): Promise<{ title: string; version: string; schema: unknown }> {
  return apiPost<{ title: string; version: string; schema: unknown }>(
    `marketplace/listings/${listingId}/download`,
    {}
  );
}

/**
 * Get marketplace aggregate statistics.
 */
export async function getMarketplaceStats(): Promise<{
  total_listings: number;
  total_downloads: number;
  total_reviews: number;
}> {
  return apiGet<{
    total_listings: number;
    total_downloads: number;
    total_reviews: number;
  }>("marketplace/stats");
}

/**
 * Submit a review for a marketplace listing.
 */
export async function submitMarketplaceReview(
  listingId: string,
  review: { rating: number; review_text?: string }
): Promise<void> {
  await apiPost<unknown>(
    `marketplace/listings/${listingId}/reviews`,
    review
  );
}

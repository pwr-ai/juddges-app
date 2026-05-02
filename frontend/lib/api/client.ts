import { DocumentType } from "@/types/search";
export type { SearchResult } from "@/types/search";
import logger from "@/lib/logger";

export const apiLogger = logger.child('api');

export interface DocumentRetrievalInput {
  question: string;
  document_types?: DocumentType[] | null;
  languages?: string[] | null;
  max_documents?: number | null;
  score_threshold?: number | null;
  chat_history?: { content: string, role: "ai" | "human" }[] | null;
  response_format?: "short" | "detailed" | "adaptive" | null;
}

export interface DocumentRetrievalOutput {
  text: string;
  document_ids: string[];
  format_used?: "short" | "detailed" | null;
}

export interface ApiResponse {
  output: DocumentRetrievalOutput;
  metadata: {
    run_id: string;
    feedback_tokens: {
      key: string;
      token_url: string | null;
      expires_at: string | null;
    }[];
  };
}

export interface StreamData {
  type: string;
  data?: {
    text?: string;
    document_ids?: string[];
    source_documents?: unknown[];
  };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface SearchDocumentsInput {
  question: string;
  maxDocuments: number;
  documentTypes?: DocumentType[];
  languages?: string[];
  mode?: "rabbit" | "thinking";
}

export interface DocumentInput {
  document_id: string;
  document_type: string;
  title?: string | null;
  date_issued?: string | null;
  issuing_body?: {
    name: string;
    jurisdiction?: string;
    type: string;
  } | null;
  language?: string | null;
  document_number?: string | null;
  country?: string | null;
  full_text?: string | null;
  summary?: string | null;
  thesis?: string | null;
  legal_references?: Array<{
    ref_type: string;
    text: string;
    normalized_citation?: string;
  }> | null;
  legal_concepts?: Array<{
    concept_name: string;
    concept_type?: string;
  }> | null;
  keywords?: string[] | null;
  // Court-specific fields
  court_name?: string | null;
  department_name?: string | null;
  presiding_judge?: string | null;
  judges?: string[] | null;
  parties?: string | null;
  outcome?: string | null;
  legal_bases?: string[] | null;
  extracted_legal_bases?: string | null;
  references?: string[] | null;
  // Metadata
  metadata?: {
    source_url?: string;
    ingestion_date?: string;
    last_updated?: string;
    processing_status?: string;
    publication_date?: string;
    raw_content?: string;
    source?: string;
    x?: number;
    y?: number;
  };
  // Additional fields for API responses
  full_text_preview?: string;
  score?: number | null;
}

export interface StreamChatCallbacks {
  onToken: (token: string) => void;
  onMetadata?: (metadata: Record<string, unknown>) => void;
  onComplete: (fullText: string, documentIds?: string[]) => void;
  onError: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Centralized fetch-based API client with typed errors.
//
// This is intentionally minimal: a thin wrapper over fetch that normalizes
// HTTP errors into a single `ApiError` class with a `status` field, makes
// JSON content-type the default, and supports per-request API key headers.
// ---------------------------------------------------------------------------

/**
 * Error thrown for non-2xx HTTP responses returned through `apiClient`.
 *
 * Carries the HTTP `status` code and the parsed response body (if any) so
 * callers can branch on status and surface server-provided detail messages.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Per-request options for `apiClient` methods.
 *
 * - `apiKey`  Sent as the `X-API-Key` header when provided.
 * - `signal`  AbortSignal for cancellation support.
 * - `headers` Additional headers merged into the default `Content-Type: application/json`.
 */
export interface ApiClientRequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  path: string,
  init: RequestInit,
  opts: ApiClientRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.apiKey) {
    headers['X-API-Key'] = opts.apiKey;
  }

  const response = await fetch(path, { ...init, headers, signal: opts.signal });

  // Best-effort body parse; some 204/empty responses won't have JSON.
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, detail, body);
  }
  return body as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: ApiClientRequestOptions) =>
    request<T>(path, { method: 'GET' }, opts),
  post: <T>(path: string, body: unknown, opts?: ApiClientRequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, opts),
  patch: <T>(path: string, body: unknown, opts?: ApiClientRequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, opts),
  delete: <T>(path: string, opts?: ApiClientRequestOptions) =>
    request<T>(path, { method: 'DELETE' }, opts),
};

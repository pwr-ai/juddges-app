import { DocumentType, SearchDocumentsDirectResponse, ChunksByDocumentIdsResponse, SearchResult, SearchChunk, SearchDocument } from "@/types/search";
export type { SearchResult } from "@/types/search";
import logger from "@/lib/logger";

const apiLogger = logger.child('api');

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

export async function askQuestion(
  input: DocumentRetrievalInput
): Promise<ApiResponse> {
  const response = await fetch(`/api/qa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function askChatQuestion(
  input: DocumentRetrievalInput
): Promise<ApiResponse> {
  const response = await fetch(`/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    // Try to parse error response to get more details
    let errorMessage = `API error: ${response.status}`;
    let errorDetails: unknown = null;

    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'string'
          ? errorData.detail
          : JSON.stringify(errorData.detail);
      }
      errorDetails = errorData;
    } catch {
      // If we can't parse JSON, try to get text
      try {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = errorText;
        }
      } catch {
        // Use default error message
      }
    }

    const error = new Error(errorMessage);
    (error as Error & { status?: number; details?: unknown }).status = response.status;
    (error as Error & { status?: number; details?: unknown }).details = errorDetails;
    throw error;
  }

  return response.json();
}

export interface StreamChatCallbacks {
  onToken: (token: string) => void;
  onMetadata?: (metadata: Record<string, unknown>) => void;
  onComplete: (fullText: string, documentIds?: string[]) => void;
  onError: (error: Error) => void;
}

// Configuration for simulated streaming
const SIMULATE_STREAMING = true; // Set to false to disable
const CHARS_PER_CHUNK = 10; // Characters to show per update (~2 words at a time)
const CHUNK_DELAY_MS = 25; // Milliseconds between chunks (40 updates/second = ~400 chars/sec)

export async function streamChatQuestion(
  input: DocumentRetrievalInput,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(`/api/chat?stream=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      // Try to parse error response to get more details
      let errorMessage = `API error: ${response.status}`;
      let errorDetails: unknown = null;

      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail);
        }
        errorDetails = errorData;
      } catch {
        // If we can't parse JSON, try to get text
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        } catch {
          // Use default error message
        }
      }

      const error = new Error(errorMessage);
      (error as Error & { status?: number; details?: unknown }).status = response.status;
      (error as Error & { status?: number; details?: unknown }).details = errorDetails;
      throw error;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    // Process the stream
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let documentIds: string[] | undefined;
    let latestChunkSequence = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer before completing
          if (buffer.trim()) {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim() === "" || !line.startsWith("data: ")) continue;

              const jsonStr = line.slice(5).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const data = JSON.parse(jsonStr);

                if (data.event === "data" && data.data) {
                  const text = data.data.text || data.data?.chunk?.text || "";
                  if (text && text.length > fullText.length) {
                    fullText = text;
                    callbacks.onToken(text);
                  }
                  if (data.data.document_ids) {
                    documentIds = data.data.document_ids;
                  }
                }
              } catch (e) {
                apiLogger.error("Error parsing buffered SSE data", e);
              }
            }
          }

          callbacks.onComplete(fullText, documentIds);
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete events in the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(5).trim();

            // Skip the [DONE] message
            if (jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);

              // Try to extract text from ANY structure
              let extractedText = "";
              let extractedDocIds: string[] | undefined;

              // Method 1: Check if data.event === "data" (LangServe format)
              if (data.event === "data") {
                const chunk = data.data?.chunk;
                const directData = data.data;

                // Try chunk first
                if (chunk) {
                  if (typeof chunk === "string") {
                    extractedText = chunk;
                  } else if (chunk.text) {
                    extractedText = chunk.text;
                  } else if (chunk.output?.text) {
                    extractedText = chunk.output.text;
                  } else if (chunk.content) {
                    extractedText = typeof chunk.content === "string" ? chunk.content : "";
                  }
                }

                // Try direct data
                if (!extractedText && directData) {
                  if (typeof directData === "string") {
                    extractedText = directData;
                  } else if (directData.text) {
                    extractedText = directData.text;
                  } else if (directData.output?.text) {
                    extractedText = directData.output.text;
                  }
                }

                // Extract document IDs
                if (chunk?.document_ids) {
                  extractedDocIds = chunk.document_ids;
                } else if (directData?.document_ids) {
                  extractedDocIds = directData.document_ids;
                }
              }
              // Method 2: Maybe it's a direct response without event wrapper
              else if (data.text) {
                extractedText = data.text;
                extractedDocIds = data.document_ids;
              }
              // Method 3: Check for output property
              else if (data.output?.text) {
                extractedText = data.output.text;
                extractedDocIds = data.output.document_ids;
              }
              // Method 4: Metadata event
              else if (data.event === "metadata" && callbacks.onMetadata) {
                callbacks.onMetadata(data.data);
              }
              // Method 5: End event
              else if (data.event === "end") {
                const output = data.data?.output || data.output;
                if (output && output.text && !fullText) {
                  extractedText = output.text;
                  extractedDocIds = output.document_ids;
                }
              }

              // Process extracted text
              if (extractedText) {
                // Backend sends progressively growing text (buffer filling up)
                // Use length as the key - only update if we got MORE text than before
                const textLength = extractedText.length;

                if (textLength > fullText.length) {
                  const chunkSequence = ++latestChunkSequence;
                  const previousLength = fullText.length;
                  fullText = extractedText;

                  const sendToken = (token: string): void => {
                    if (chunkSequence !== latestChunkSequence) {
                      return;
                    }
                    callbacks.onToken(token);
                  };

                  // Simulate slower streaming for smoother visual effect
                  if (SIMULATE_STREAMING && previousLength === 0) {
                    // First chunk - simulate token-by-token rendering
                    let currentPos = 0;
                    const streamChunks = (): void => {
                      if (chunkSequence !== latestChunkSequence) {
                        return;
                      }

                      if (currentPos < extractedText.length) {
                        const nextPos = Math.min(currentPos + CHARS_PER_CHUNK, extractedText.length);
                        const chunk = extractedText.substring(0, nextPos);
                        sendToken(chunk);
                        currentPos = nextPos;

                        if (currentPos < extractedText.length) {
                          setTimeout(streamChunks, CHUNK_DELAY_MS);
                        }
                      }
                    };
                    streamChunks();
                  } else {
                    // Subsequent updates or no simulation - send immediately
                    sendToken(extractedText);
                  }
                }
              }
              // Note: Not all events have text (e.g., metadata, empty end events) - this is expected

              // Update document IDs if found
              if (extractedDocIds) {
                documentIds = extractedDocIds;
              }
            } catch (e) {
              apiLogger.error("Error parsing SSE data", e, { line: jsonStr });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error) {
      // Don't call onError for AbortError (user cancelled)
      if (error.name === "AbortError") {
        return;
      }
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error("Unknown error occurred during streaming"));
    }
  }
}

export async function streamQuestion(
  input: DocumentRetrievalInput,
  onData: (data: StreamData) => void,
  onComplete: () => void
): Promise<void> {
  const response = await fetch(`/api/qa/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  // Process the stream
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      onComplete();
      break;
    }

    // Decode the chunk and add to buffer
    buffer += decoder.decode(value, { stream: true });

    // Process complete events in the buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

    for (const line of lines) {
      if (line.trim() === "") continue;

      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(5).trim();
        try {
          const data = JSON.parse(jsonStr);
          onData(data);
        } catch (e) {
          apiLogger.error("Error parsing SSE data", e);
        }
      }
    }
  }
}

export async function searchDocuments(
  query: string,
  maxDocuments: number,
  options?: {
    documentTypes?: DocumentType[];
    languages?: string[];
    mode?: "rabbit" | "thinking";
    page?: number;
    pageSize?: number;
    maxThreshold?: number;
  }
): Promise<SearchResult> {
  const requestBody = {
    question: query,
    maxDocuments: maxDocuments,
    maxThreshold: options?.maxThreshold || null,
    documentTypes: options?.documentTypes || null,
    documentType: options?.documentTypes?.[0] || null, // For backward compatibility
    languages: options?.languages || null,
    mode: options?.mode || "rabbit",
    page: options?.page || 1,
    pageSize: options?.pageSize || 20,
  };

  const response = await fetch(`/api/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    // Log the actual error for developers but show a user-friendly message
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch search results' }));
    console.error('Search API error:', response.status, errorData);
    throw new Error('Search request failed. Please try again.');
  }

  return await response.json();
}

export async function getExampleQuestions(
  numPolish: number = 2,
  numEnglish: number = 2
): Promise<string[]> {
  const response = await fetch(
    `/api/example_questions?num_polish=${numPolish}&num_english=${numEnglish}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.questions;
}

// New API functions for optimized search

export interface SearchDocumentsDirectInput {
  query: string;
  mode: "rabbit" | "thinking";
  languages?: string[];
  document_types?: string[];
  return_properties?: string[];
}

export async function searchDocumentsDirect(
  input: SearchDocumentsDirectInput
): Promise<SearchDocumentsDirectResponse> {
  apiLogger.info('searchDocumentsDirect called', {
    query: input.query,
    mode: input.mode,
    languages: input.languages,
    document_types: input.document_types,
    return_properties: input.return_properties,
  });

  const response = await fetch(`/api/documents/search/direct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to search documents' }));
    apiLogger.error('Search direct API error:', response.status, errorData);
    throw new Error('Document search failed. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('searchDocumentsDirect response', {
    documentCount: result.documents?.length,
    totalCount: result.total_count,
    isCapped: result.is_capped,
  });

  return result;
}

export interface GetChunksForDocumentsInput {
  query: string;
  document_ids: string[];
  return_properties?: string[];
}

export async function getChunksForDocuments(
  input: GetChunksForDocumentsInput
): Promise<ChunksByDocumentIdsResponse> {
  const response = await fetch(`/api/documents/chunks/by-document-ids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch chunks' }));
    apiLogger.error('Get chunks API error:', response.status, errorData);
    throw new Error('Failed to load document chunks. Please try again.');
  }

  return await response.json();
}

// New chunk-based search API functions

export interface SearchChunksInput {
  query: string;
  limit_docs?: number;
  alpha?: number;
  languages?: string[];
  document_types?: string[];
  segment_types?: string[];
  fetch_full_documents?: boolean;
  limit_chunks?: number;
  mode?: "rabbit" | "thinking";
  /** Offset for pagination (0-indexed). Default 0. */
  offset?: number;
  /** Whether to include estimated total count. Set to false for load-more requests. Default true. */
  include_count?: boolean;
}

/** Pagination metadata for progressive loading */
export interface PaginationMetadata {
  /** Current offset (0-indexed) */
  offset: number;
  /** Number of results per page */
  limit: number;
  /** Total results loaded so far */
  loaded_count: number;
  /** Estimated total matching documents (filter-based, approximate) */
  estimated_total: number | null;
  /** True if more results are available beyond current page */
  has_more: boolean;
  /** Offset for next page, or null if no more results */
  next_offset: number | null;
}

export interface SearchChunksResponse {
  chunks: SearchChunk[];
  documents?: SearchDocument[] | null;
  total_chunks: number;
  unique_documents: number;
  query_time_ms?: number | null;
  timing_breakdown?: Record<string, number> | null;
  /** Pagination metadata for progressive loading (infinite scroll support) */
  pagination?: PaginationMetadata | null;
}

export async function searchChunks(
  input: SearchChunksInput
): Promise<SearchChunksResponse> {
  apiLogger.info('searchChunks called', {
    query: input.query,
    limit_docs: input.limit_docs,
    alpha: input.alpha,
    languages: input.languages,
    document_types: input.document_types,
    segment_types: input.segment_types,
    fetch_full_documents: input.fetch_full_documents,
    limit_chunks: input.limit_chunks,
    offset: input.offset,
    include_count: input.include_count,
  });

  // Use unified /search endpoint (enhanced mode is default)
  const response = await fetch(`/api/documents/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to search chunks' }));
    apiLogger.error('Search chunks API error:', response.status, errorData);
    throw new Error('Chunk search failed. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('searchChunks response', {
    chunkCount: result.chunks?.length,
    totalChunks: result.total_chunks,
    uniqueDocuments: result.unique_documents,
    queryTimeMs: result.query_time_ms,
    pagination: result.pagination ? {
      offset: result.pagination.offset,
      loaded_count: result.pagination.loaded_count,
      estimated_total: result.pagination.estimated_total,
      has_more: result.pagination.has_more,
    } : null,
  });

  return result;
}

export interface FetchChunksByUuidInput {
  chunk_uuids: string[];
}

export interface FetchChunksByUuidResponse {
  chunks: SearchChunk[];
  total_chunks: number;
}

export async function fetchChunksByUuid(
  input: FetchChunksByUuidInput
): Promise<FetchChunksByUuidResponse> {
  apiLogger.info('fetchChunksByUuid called', {
    chunkUuidCount: input.chunk_uuids.length,
  });

  const response = await fetch(`/api/documents/chunks/fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch chunks by UUID' }));
    apiLogger.error('Fetch chunks by UUID API error:', response.status, errorData);
    throw new Error('Failed to fetch chunk details. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('fetchChunksByUuid response', {
    chunkCount: result.chunks?.length,
    totalChunks: result.total_chunks,
  });

  return result;
}

// Batch fetch documents by IDs
export interface FetchDocumentsByIdsInput {
  document_ids: string[];
  return_vectors?: boolean;
  return_properties?: string[];
}

export interface FetchDocumentsByIdsResponse {
  documents: SearchDocument[];
}

export async function fetchDocumentsByIds(
  input: FetchDocumentsByIdsInput
): Promise<FetchDocumentsByIdsResponse> {
  apiLogger.info('fetchDocumentsByIds called', {
    documentIdCount: input.document_ids.length,
    return_properties: input.return_properties,
  });

  const payload: Record<string, unknown> = {
    document_ids: input.document_ids,
    return_vectors: input.return_vectors || false,
  };

  // Only include return_properties if it's a non-empty array
  if (input.return_properties && Array.isArray(input.return_properties) && input.return_properties.length > 0) {
    payload.return_properties = input.return_properties;
    apiLogger.debug('Including return_properties in request', {
      return_properties: input.return_properties,
      count: input.return_properties.length,
    });
  } else {
    apiLogger.debug('NOT including return_properties (empty or missing)', {
      return_properties: input.return_properties,
      isArray: Array.isArray(input.return_properties),
      length: input.return_properties?.length,
    });
  }

  const response = await fetch(`/api/documents/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch documents' }));
    apiLogger.error('Fetch documents by IDs API error:', response.status, errorData);
    throw new Error('Failed to fetch documents. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('fetchDocumentsByIds response', {
    documentCount: result.documents?.length,
  });

  return result;
}

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

// Bulk extraction

export interface BulkExtractionJobInfo {
  job_id: string;
  schema_id: string;
  schema_name: string | null;
  status: string;
}

export interface BulkExtractionInput {
  collection_id: string;
  schema_ids: string[];
  document_ids?: string[];
  extraction_context?: string;
  language?: string;
  auto_export?: boolean;
  scheduled_at?: string;
}

export interface BulkExtractionResponse {
  bulk_id: string;
  status: 'accepted' | 'scheduled' | 'rejected';
  jobs: BulkExtractionJobInfo[];
  total_schemas: number;
  total_documents: number;
  auto_export: boolean;
  scheduled_at: string | null;
  message: string | null;
}

export async function submitBulkExtraction(
  input: BulkExtractionInput
): Promise<BulkExtractionResponse> {
  apiLogger.info('submitBulkExtraction called', {
    collectionId: input.collection_id,
    schemaIds: input.schema_ids,
    documentCount: input.document_ids?.length,
    autoExport: input.auto_export,
  });

  const response = await fetch(`/api/extractions/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to start bulk extraction' }));
    apiLogger.error('Bulk extraction API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to start bulk extraction. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('submitBulkExtraction response', {
    bulkId: result.bulk_id,
    status: result.status,
    jobCount: result.jobs?.length,
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

// Document Versioning

import type {
  VersionHistoryResponse,
  VersionDetailResponse,
  VersionDiffResponse,
  CreateVersionInput,
  RevertVersionResponse,
  RevertVersionInput,
  DocumentVersion,
} from '@/types/versioning';

export type {
  VersionHistoryResponse,
  VersionDetailResponse,
  VersionDiffResponse,
  DocumentVersion,
  RevertVersionResponse,
};

export async function getVersionHistory(
  documentId: string,
  options?: { limit?: number; offset?: number }
): Promise<VersionHistoryResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const url = `/api/documents/${documentId}/versions${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch version history. Please try again.');
  }

  return await response.json();
}

export async function getVersionDetail(
  documentId: string,
  versionNumber: number
): Promise<VersionDetailResponse> {
  const response = await fetch(`/api/documents/${documentId}/versions/${versionNumber}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch version detail. Please try again.');
  }

  return await response.json();
}

export async function getVersionDiff(
  documentId: string,
  fromVersion: number,
  toVersion: number
): Promise<VersionDiffResponse> {
  const response = await fetch(
    `/api/documents/${documentId}/versions/diff?from=${fromVersion}&to=${toVersion}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate version diff. Please try again.');
  }

  return await response.json();
}

export async function createVersionSnapshot(
  documentId: string,
  input?: CreateVersionInput
): Promise<DocumentVersion> {
  const response = await fetch(`/api/documents/${documentId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create version' }));
    throw new Error(errorData.message || 'Failed to create version snapshot. Please try again.');
  }

  return await response.json();
}

// ===== OCR Processing =====

export interface OCRQualityMetrics {
  avg_confidence: number;
  low_confidence_words: number;
  total_words: number;
  estimated_accuracy: number;
  needs_review: boolean;
  quality_level: 'high' | 'medium' | 'low';
}

export interface OCRPageResult {
  page_number: number;
  extracted_text: string;
  confidence_score: number;
  word_count: number;
  quality_metrics: OCRQualityMetrics | null;
}

export interface OCRJobResponse {
  job_id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string | null;
}

export interface OCRJobStatus {
  job_id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source_type: string;
  source_filename: string | null;
  extracted_text: string | null;
  confidence_score: number | null;
  page_count: number | null;
  language_detected: string | null;
  quality_metrics: OCRQualityMetrics | null;
  pages: OCRPageResult[] | null;
  corrected_text: string | null;
  correction_notes: string | null;
  corrected_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface OCRJobListResponse {
  jobs: OCRJobStatus[];
  total: number;
  page: number;
  page_size: number;
}

export interface OCRCorrectionInput {
  corrected_text: string;
  correction_notes?: string;
  page_corrections?: Array<{ page_number: number; corrected_text: string }>;
}

export interface OCRCorrectionResponse {
  job_id: string;
  status: 'corrected';
  corrected_at: string;
  message: string;
}

export async function submitOCRFile(
  file: File,
  documentId: string,
  sourceType: 'pdf' | 'image',
  languageHint?: string,
): Promise<OCRJobResponse> {
  apiLogger.info('submitOCRFile called', {
    fileName: file.name,
    fileSize: file.size,
    documentId,
    sourceType,
  });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_id', documentId);
  formData.append('source_type', sourceType);
  if (languageHint) {
    formData.append('language_hint', languageHint);
  }

  const response = await fetch('/api/ocr/jobs', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit OCR job' }));
    apiLogger.error('OCR submit API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit OCR job. Please try again.');
  }

  return await response.json();
}

export async function submitOCRText(
  documentId: string,
  sourceType: 'pdf' | 'image',
  sourceFilename?: string,
  languageHint?: string,
): Promise<OCRJobResponse> {
  apiLogger.info('submitOCRText called', { documentId, sourceType });

  const response = await fetch('/api/ocr/jobs/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: documentId,
      source_type: sourceType,
      source_filename: sourceFilename,
      language_hint: languageHint,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit OCR text job' }));
    apiLogger.error('OCR text submit API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit OCR text job. Please try again.');
  }

  return await response.json();
}

export async function getOCRJobStatus(jobId: string): Promise<OCRJobStatus> {
  const response = await fetch(`/api/ocr/jobs/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch OCR job status. Please try again.');
  }

  return await response.json();
}

export async function listOCRJobs(
  options?: { documentId?: string; status?: string; page?: number; pageSize?: number }
): Promise<OCRJobListResponse> {
  const params = new URLSearchParams();
  if (options?.documentId) params.set('document_id', options.documentId);
  if (options?.status) params.set('status', options.status);
  if (options?.page) params.set('page', options.page.toString());
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());

  const url = `/api/ocr/jobs${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to list OCR jobs. Please try again.');
  }

  return await response.json();
}

export async function submitOCRCorrection(
  jobId: string,
  input: OCRCorrectionInput,
): Promise<OCRCorrectionResponse> {
  apiLogger.info('submitOCRCorrection called', { jobId });

  const response = await fetch(`/api/ocr/jobs/${jobId}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit corrections' }));
    apiLogger.error('OCR correction API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit corrections. Please try again.');
  }

  return await response.json();
}

export async function revertToVersion(
  documentId: string,
  input: RevertVersionInput
): Promise<RevertVersionResponse> {
  const response = await fetch(`/api/documents/${documentId}/versions/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to revert version' }));
    throw new Error(errorData.message || 'Failed to revert to version. Please try again.');
  }

  return await response.json();
}

// ===== Semantic Clustering =====

export interface SemanticClusteringInput {
  sample_size?: number;
  num_clusters?: number;
  document_types?: string[];
}

export interface ClusterDocument {
  document_id: string;
  title: string | null;
  document_type: string | null;
  date_issued: string | null;
  similarity_to_centroid: number;
}

export interface SemanticCluster {
  cluster_id: number;
  size: number;
  keywords: string[];
  coherence_score: number;
  documents: ClusterDocument[];
}

export interface ClusterNode {
  id: string;
  title: string;
  document_type: string;
  year: number | null;
  x: number;
  y: number;
  cluster_id: number;
}

export interface ClusterEdge {
  source: string;
  target: string;
  similarity: number;
}

export interface ClusteringStatistics {
  total_documents: number;
  num_clusters: number;
  avg_cluster_size: number;
  min_cluster_size: number;
  max_cluster_size: number;
  avg_coherence: number;
  clustering_time_ms: number;
}

export interface SemanticClusteringResponse {
  clusters: SemanticCluster[];
  nodes: ClusterNode[];
  edges: ClusterEdge[];
  statistics: ClusteringStatistics;
}

export async function getSemanticClusters(
  input?: SemanticClusteringInput
): Promise<SemanticClusteringResponse> {
  apiLogger.info('getSemanticClusters called', {
    sampleSize: input?.sample_size,
    numClusters: input?.num_clusters,
    documentTypes: input?.document_types,
  });

  const response = await fetch('/api/clustering/semantic-clusters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to generate clusters' }));
    apiLogger.error('Clustering API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to generate semantic clusters. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('getSemanticClusters response', {
    clusterCount: result.clusters?.length,
    nodeCount: result.nodes?.length,
    edgeCount: result.edges?.length,
  });

  return result;
}


// ===== Smart Recommendations =====

import type { RecommendationsResponse, TrackInteractionRequest } from "@/types/recommendations";

export async function getRecommendations(params?: {
  query?: string;
  document_id?: string;
  limit?: number;
  strategy?: "auto" | "content_based" | "history_based" | "hybrid";
}): Promise<RecommendationsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set("query", params.query);
  if (params?.document_id) searchParams.set("document_id", params.document_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.strategy) searchParams.set("strategy", params.strategy);

  const url = `/api/recommendations?${searchParams.toString()}`;
  apiLogger.info("getRecommendations called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to fetch recommendations" }));
    apiLogger.error("Recommendations API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to fetch recommendations.");
  }

  return response.json();
}

export async function trackDocumentInteraction(
  request: TrackInteractionRequest
): Promise<void> {
  try {
    await fetch("/api/recommendations/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    // Non-critical, silently fail
    apiLogger.warn("Failed to track document interaction", request);
  }
}


// ===== Research Assistant =====

import type {
  AnalyzeResearchRequest,
  AnalyzeResearchResponse,
  QuickSuggestion,
  SavedResearchContext,
  SaveResearchContextRequest,
} from "@/types/research-assistant";

export async function analyzeResearchContext(
  request: AnalyzeResearchRequest
): Promise<AnalyzeResearchResponse> {
  apiLogger.info("analyzeResearchContext called", request);

  const response = await fetch("/api/research-assistant?action=analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to analyze research context" }));
    apiLogger.error("Research analysis API error: ", response.status, errorData);
    throw new Error(
      errorData.error || "Failed to analyze research context."
    );
  }

  return response.json();
}

export async function getResearchSuggestions(params?: {
  query?: string;
  document_id?: string;
  limit?: number;
}): Promise<QuickSuggestion> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "suggestions");
  if (params?.query) searchParams.set("query", params.query);
  if (params?.document_id)
    searchParams.set("document_id", params.document_id);
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const url = `/api/research-assistant?${searchParams.toString()}`;
  apiLogger.info("getResearchSuggestions called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to fetch suggestions" }));
    apiLogger.error("Suggestions API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to fetch suggestions.");
  }

  return response.json();
}

export async function getResearchContexts(params?: {
  limit?: number;
  status?: string;
}): Promise<SavedResearchContext[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "contexts");
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.status) searchParams.set("status", params.status);

  const url = `/api/research-assistant?${searchParams.toString()}`;
  apiLogger.info("getResearchContexts called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to fetch research contexts" }));
    apiLogger.error("Contexts API error: ", response.status, errorData);
    throw new Error(
      errorData.error || "Failed to fetch research contexts."
    );
  }

  return response.json();
}

export async function saveResearchContext(
  request: SaveResearchContextRequest
): Promise<SavedResearchContext> {
  apiLogger.info("saveResearchContext called", request);

  const response = await fetch("/api/research-assistant?action=save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Failed to save research context" }));
    apiLogger.error(
      "Save context API error: ",
      response.status,
      errorData
    );
    throw new Error(
      errorData.error || "Failed to save research context."
    );
  }

  return response.json();
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

// ===== Schema Marketplace =====

import type {
  BrowseListingsResponse,
  MarketplaceListingDetail,
  MarketplaceListingItem,
  MarketplaceStatsResponse,
  DownloadResponse as MarketplaceDownloadResponse,
  ReviewsResponse as MarketplaceReviewsResponse,
  PublishListingRequest,
  SubmitReviewRequest,
  MarketplaceSortBy,
} from "@/types/marketplace";

export type {
  BrowseListingsResponse,
  MarketplaceListingDetail,
  MarketplaceListingItem,
  MarketplaceStatsResponse,
  MarketplaceDownloadResponse,
  MarketplaceReviewsResponse,
};

export async function browseMarketplaceListings(params?: {
  search?: string;
  category?: string;
  tags?: string;
  sort_by?: MarketplaceSortBy;
  page?: number;
  page_size?: number;
}): Promise<BrowseListingsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "browse");
  if (params?.search) searchParams.set("search", params.search);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.tags) searchParams.set("tags", params.tags);
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));

  const url = `/api/marketplace?${searchParams.toString()}`;
  apiLogger.info("browseMarketplaceListings called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to browse marketplace" }));
    apiLogger.error("Marketplace browse API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to browse marketplace.");
  }

  return response.json();
}

export async function getMarketplaceStats(): Promise<MarketplaceStatsResponse> {
  const response = await fetch("/api/marketplace?endpoint=stats");

  if (!response.ok) {
    throw new Error("Failed to fetch marketplace statistics.");
  }

  return response.json();
}

export async function getMyMarketplaceListings(params?: {
  status_filter?: string;
  page?: number;
  page_size?: number;
}): Promise<BrowseListingsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "my-listings");
  if (params?.status_filter) searchParams.set("status_filter", params.status_filter);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));

  const response = await fetch(`/api/marketplace?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch your listings.");
  }

  return response.json();
}

export async function publishToMarketplace(
  input: PublishListingRequest
): Promise<MarketplaceListingItem> {
  apiLogger.info("publishToMarketplace called", { schemaId: input.schema_id, title: input.title });

  const response = await fetch("/api/marketplace?action=publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to publish schema" }));
    apiLogger.error("Marketplace publish API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to publish schema to marketplace.");
  }

  return response.json();
}

export async function downloadMarketplaceSchema(
  listingId: string
): Promise<MarketplaceDownloadResponse> {
  apiLogger.info("downloadMarketplaceSchema called", { listingId });

  const response = await fetch(`/api/marketplace?action=download&listing_id=${listingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to download schema" }));
    throw new Error(errorData.error || "Failed to download schema.");
  }

  return response.json();
}

export async function submitMarketplaceReview(
  listingId: string,
  input: SubmitReviewRequest
): Promise<void> {
  apiLogger.info("submitMarketplaceReview called", { listingId, rating: input.rating });

  const response = await fetch(`/api/marketplace?action=review&listing_id=${listingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to submit review" }));
    throw new Error(errorData.error || "Failed to submit review.");
  }
}

// ===== Timeline Extraction =====

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

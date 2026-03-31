import { DocumentType, SearchDocumentsDirectResponse, SearchChunk, SearchDocument } from "@/types/search";
import { apiLogger } from './client';

export interface SearchDocumentsDirectInput {
  query: string;
  mode: "rabbit" | "thinking";
  languages?: string[];
  document_types?: string[];
  return_properties?: string[];
}

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
): Promise<import("@/types/search").SearchResult> {
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

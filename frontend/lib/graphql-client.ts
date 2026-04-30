/**
 * Lightweight GraphQL client for the Juddges frontend.
 *
 * Uses the standard fetch API to communicate with the GraphQL endpoint
 * via the Next.js API proxy route at /api/graphql.
 *
 * No heavy dependencies (urql, apollo) are needed — a simple fetch-based
 * client is sufficient for the current feature set. This keeps the bundle
 * size small and avoids introducing a new caching layer on top of
 * React Query which already handles server state caching.
 */

import logger from '@/lib/logger';

const graphqlLogger = logger.child('graphql');

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

export interface GraphQLRequestOptions {
  /** Abort signal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Execute a GraphQL query or mutation against the backend via the Next.js proxy.
 *
 * @example
 * ```ts
 * const { data } = await graphqlFetch<{ document: { title: string } }>(
 *   `query GetDoc($id: String!) {
 *     document(documentId: $id) { title summary }
 *   }`,
 *   { id: 'II FSK 1234/21' }
 * );
 * ```
 */
export async function graphqlFetch<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  options?: GraphQLRequestOptions
): Promise<GraphQLResponse<T>> {
  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: options?.signal,
  });

  const json: GraphQLResponse<T> = await response.json();

  if (json.errors && json.errors.length > 0) {
    graphqlLogger.error('GraphQL errors', { errors: json.errors });
  }

  return json;
}

// ===== Pre-built Query Fragments =====

export const DOCUMENT_FIELDS = `
  documentId
  documentType
  title
  dateIssued
  language
  summary
  keywords
  courtName
  documentNumber
  thesis
  country
  parties
  outcome
  presidingJudge
`;

export const DOCUMENT_METADATA_FIELDS = `
  uuid
  documentId
  documentType
  language
  title
  summary
  courtName
  documentNumber
  keywords
  dateIssued
  score
`;

export const CHUNK_FIELDS = `
  documentId
  documentType
  language
  chunkId
  chunkText
  segmentType
  position
  confidenceScore
`;

// ===== Pre-built Queries =====

export const SEARCH_DOCUMENTS_QUERY = `
  query SearchDocuments($input: SearchDocumentsInput!) {
    searchDocuments(input: $input) {
      documents {
        ${DOCUMENT_METADATA_FIELDS}
      }
      totalCount
      isCapped
      queryTimeMs
    }
  }
`;

export const SEARCH_CHUNKS_QUERY = `
  query SearchChunks($input: SearchChunksInput!) {
    searchChunks(input: $input) {
      chunks {
        ${CHUNK_FIELDS}
      }
      totalChunks
      uniqueDocuments
      queryTimeMs
      pagination {
        offset
        limit
        loadedCount
        estimatedTotal
        hasMore
        nextOffset
      }
    }
  }
`;

export const GET_DOCUMENT_QUERY = `
  query GetDocument($documentId: String!) {
    document(documentId: $documentId) {
      ${DOCUMENT_FIELDS}
    }
  }
`;

export const GET_DOCUMENT_FULL_TEXT_QUERY = `
  query GetDocumentFullText($documentId: String!) {
    documentFullText(documentId: $documentId)
  }
`;

export const SIMILAR_DOCUMENTS_QUERY = `
  query SimilarDocuments($documentIds: [String!]!, $topK: Int) {
    similarDocuments(documentIds: $documentIds, topK: $topK) {
      queryDocumentId
      similarDocuments {
        documentId
        dbId
        similarityScore
        title
        documentType
      }
      totalFound
    }
  }
`;

export const EXTRACTION_JOBS_QUERY = `
  query ExtractionJobs($status: String, $collectionId: String, $page: Int, $pageSize: Int) {
    extractionJobs(status: $status, collectionId: $collectionId, page: $page, pageSize: $pageSize) {
      jobId
      collectionId
      status
      createdAt
      totalDocuments
      completedDocuments
      elapsedTimeSeconds
    }
  }
`;

// ===== Convenience Query Functions =====

export async function searchDocumentsGQL(params: {
  query: string;
  mode?: string;
  alpha?: number;
  languages?: string[];
  documentTypes?: string[];
}) {
  return graphqlFetch(SEARCH_DOCUMENTS_QUERY, {
    input: {
      query: params.query,
      mode: params.mode || 'rabbit',
      alpha: params.alpha ?? 0.5,
      languages: params.languages,
      documentTypes: params.documentTypes,
    },
  });
}

export async function searchChunksGQL(params: {
  query: string;
  limitDocs?: number;
  alpha?: number;
  languages?: string[];
  documentTypes?: string[];
  offset?: number;
  mode?: string;
}) {
  return graphqlFetch(SEARCH_CHUNKS_QUERY, {
    input: {
      query: params.query,
      limitDocs: params.limitDocs ?? 20,
      alpha: params.alpha ?? 0.7,
      languages: params.languages,
      documentTypes: params.documentTypes,
      offset: params.offset ?? 0,
      mode: params.mode || 'rabbit',
    },
  });
}

export async function getDocumentGQL(documentId: string) {
  return graphqlFetch(GET_DOCUMENT_QUERY, { documentId });
}

export async function getDocumentFullTextGQL(documentId: string) {
  return graphqlFetch<{ documentFullText: string | null }>(
    GET_DOCUMENT_FULL_TEXT_QUERY,
    { documentId }
  );
}

export async function getSimilarDocumentsGQL(
  documentIds: string[],
  topK: number = 10
) {
  return graphqlFetch(SIMILAR_DOCUMENTS_QUERY, { documentIds, topK });
}

export async function getExtractionJobsGQL(params?: {
  status?: string;
  collectionId?: string;
  page?: number;
  pageSize?: number;
}) {
  return graphqlFetch(EXTRACTION_JOBS_QUERY, params || {});
}

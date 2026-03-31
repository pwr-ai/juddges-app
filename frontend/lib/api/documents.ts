import { ChunksByDocumentIdsResponse, SearchChunk, SearchDocument } from "@/types/search";
import { apiLogger } from './client';

export interface GetChunksForDocumentsInput {
  query: string;
  document_ids: string[];
  return_properties?: string[];
}

export interface FetchChunksByUuidInput {
  chunk_uuids: string[];
}

export interface FetchChunksByUuidResponse {
  chunks: SearchChunk[];
  total_chunks: number;
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

import type {
  CollectionFromFilterResponse,
  CreateCollectionFromFilterRequest,
} from "@/types/base-schema-filter";
import { Collection, CollectionWithDocuments } from "@/types/collection";
import { SearchDocument } from "@/types/search";
import { track } from "../analytics/track";
import { cleanDocumentIdForUrl } from "../document-utils";
import { fetchDocumentsByIds } from "./documents";

// Matches backend MAX_BATCH_DOCUMENT_IDS (see backend/app/config.py).
const DOCUMENT_BATCH_SIZE = 100;

export interface CreateCollection {
  name: string;
  description?: string;
  user_id?: string;
}

export async function createCollection(collection: CreateCollection): Promise<Collection> {
  const response = await fetch('/api/collections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(collection),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || 'Failed to create collection');
  }

  const created: Collection = await response.json();
  track('collection_created', { collection_id: created.id });
  return created;
}

export async function getCollections(): Promise<CollectionWithDocuments[]> {
  const response = await fetch("/api/collections", {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch collections");
  }

  return response.json();
}

export interface GetCollectionOptions {
  limit?: number;
  offset?: number;
}

export async function getCollection(
  id: string,
  options?: GetCollectionOptions
): Promise<CollectionWithDocuments> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', options.limit.toString());
  }
  if (options?.offset !== undefined) {
    params.set('offset', options.offset.toString());
  }

  const queryString = params.toString();
  const url = `/api/collections/${id}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch collection");
  }

  return response.json();
}

export async function updateCollection(id: string, name: string, description?: string): Promise<Collection> {
  const response = await fetch(`/api/collections/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description }),
  });

  if (!response.ok) {
    throw new Error("Failed to update collection");
  }

  return response.json();
}

export async function deleteCollection(id: string): Promise<void> {
  const response = await fetch(`/api/collections/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete collection");
  }
}

export async function addDocumentToCollection(
  collectionId: string,
  document: SearchDocument | string
): Promise<void> {
  // Extract only the document_id to avoid 413 Payload Too Large errors
  // Handle /doc/ prefix
  const documentId = typeof document === 'string'
    ? cleanDocumentIdForUrl(document)
    : cleanDocumentIdForUrl(document.document_id);

  const payload = {
    document_id: documentId,
    collection_id: collectionId
  };

  const response = await fetch(`/api/collections/${collectionId}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Failed to add document to collection");
  }

  track("collection_item_added", { collection_id: collectionId, count: 1 });
}

export async function removeDocumentFromCollection(collectionId: string, documentId: string): Promise<void> {
  const response = await fetch(`/api/collections/${collectionId}/documents/${documentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to remove document from collection");
  }
}

export interface BatchAddResult {
  message: string;
  added: string[];
  failed: { document_id: string; error: string }[];
  total_requested: number;
}

export interface LoadAllProgress {
  loaded: number;
  total: number;
}

export function chunkDocumentIds(
  ids: string[],
  size = DOCUMENT_BATCH_SIZE
): string[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function loadAllCollectionDocuments(
  documentIds: string[],
  onProgress?: (progress: LoadAllProgress) => void
): Promise<SearchDocument[]> {
  if (documentIds.length === 0) return [];

  const chunks = chunkDocumentIds(documentIds);
  const all: SearchDocument[] = [];
  onProgress?.({ loaded: 0, total: documentIds.length });

  for (const chunk of chunks) {
    const result = await fetchDocumentsByIds({
      document_ids: chunk,
      include_base_fields: true,
    });
    all.push(...result.documents);
    onProgress?.({ loaded: all.length, total: documentIds.length });
  }

  return all;
}

export async function addDocumentsToCollection(
  collectionId: string,
  documentIds: string[]
): Promise<BatchAddResult> {
  // Clean document IDs
  const cleanedIds = documentIds.map(id => cleanDocumentIdForUrl(id.trim())).filter(id => id.length > 0);

  if (cleanedIds.length === 0) {
    throw new Error("No valid document IDs provided");
  }

  const response = await fetch(`/api/collections/${collectionId}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_ids: cleanedIds }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || "Failed to add documents to collection");
  }

  const result: BatchAddResult = await response.json();
  track("collection_item_added", {
    collection_id: collectionId,
    count: result.added.length,
  });
  return result;
}

export class CollectionFromFilterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly total?: number,
    public readonly cap?: number,
    public readonly jurisdiction?: string | null,
  ) {
    super(message);
    this.name = "CollectionFromFilterError";
  }
}

/** Unwraps FastAPI's `{detail: {...}}` or the BFF's flat `{error}` into one error type. */
async function throwCollectionFromFilterError(response: Response): Promise<never> {
  const data = await response.json().catch(() => ({}));
  const d = (data && typeof data === "object" && "detail" in data && data.detail && typeof data.detail === "object")
    ? (data.detail as Record<string, unknown>)
    : (data as Record<string, unknown>);
  throw new CollectionFromFilterError(
    String(d.message ?? d.error ?? "Failed to save collection"),
    String(d.code ?? "COLLECTION_FROM_FILTER_FAILED"),
    response.status,
    typeof d.total === "number" ? d.total : undefined,
    typeof d.cap === "number" ? d.cap : undefined,
    typeof d.jurisdiction === "string" || d.jurisdiction === null ? (d.jurisdiction as string | null) : undefined,
  );
}

export async function createCollectionFromFilter(
  request: CreateCollectionFromFilterRequest,
): Promise<CollectionFromFilterResponse> {
  const response = await fetch("/api/collections/from-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) await throwCollectionFromFilterError(response);
  const result = (await response.json()) as CollectionFromFilterResponse;
  for (const created of result.collections) {
    track("collection_created", { collection_id: created.collection.id, source: "base_schema_filter", count: created.added_count });
  }
  return result;
}

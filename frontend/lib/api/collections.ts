import { Collection, CollectionWithDocuments } from "@/types/collection";
import { SearchDocument } from "@/types/search";
import { cleanDocumentIdForUrl } from "../document-utils";

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
    throw new Error('Failed to create collection');
  }

  return await response.json();
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

  return response.json();
}

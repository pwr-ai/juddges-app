// hooks/useSourceDocuments.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { SearchDocument } from '@/types/search';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { logger } from "@/lib/logger";

interface UseSourceDocumentsOptions {
  documentIds?: string[];
  enabled?: boolean;
}

interface UseSourceDocumentsResult {
  data: SearchDocument[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Re-run the request (bypasses the cache); used by the retry button. */
  refetch: () => void;
}

/** Error raised when the batch request fails; carries the HTTP status if any. */
export class SourceDocumentsError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SourceDocumentsError';
    this.status = status;
  }
}

// Limit to first 20 documents for source cards to avoid large payloads
// Users can view more by expanding or viewing the full document
export const MAX_SOURCE_CARDS = 20;

// Simple in-memory cache
const cache = new Map<string, { data: SearchDocument[]; timestamp: number }>();
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes


// Creates the placeholder object for a failed document
const createErrorPlaceholder = (id: string, message: string): SearchDocument => {
  return {
    document_id: id,
    document_type: 'error',
    summary: message,

    // Set all other nullable fields to null to satisfy the interface
    title: null,
    date_issued: null,
    issuing_body: null,
    language: null,
    document_number: null,
    country: null,
    full_text: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    court_name: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
  };
};

/**
 * Hook to fetch document details for an array of document IDs
 * Uses standard React hooks with simple caching.
 *
 * Only an id that is absent from a successful response gets the
 * "Document was not found!" placeholder. A failed request (network error,
 * 401, 5xx, redirect) surfaces through `error` and is never cached.
 */
export function useSourceDocuments({ documentIds, enabled = true }: UseSourceDocumentsOptions): UseSourceDocumentsResult {
  const [data, setData] = useState<SearchDocument[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const forceRefreshRef = useRef(false);

  const refetch = useCallback(() => {
    forceRefreshRef.current = true;
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const shouldFetch = enabled && documentIds && documentIds.length > 0;

    if (!shouldFetch) {
      forceRefreshRef.current = false;
      setData([]);
      setIsLoading(false);
      setIsError(false);
      setError(null);
      return;
    }

    const cacheKey = documentIds.join(',');

    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    // Check cache (successful responses only are ever stored)
    const cached = cache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TIME) {
      setData(cached.data);
      setError(null);
      setIsError(false);
      setIsLoading(false);
      return;
    }

    // Fetch data
    const fetchDocuments = async () => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);
      setIsError(false);
      setError(null);
      setData(undefined);

      const limitedDocumentIds = documentIds.slice(0, MAX_SOURCE_CARDS);

      try {
        // Use POST with return_properties to fetch only metadata (optimized for source cards)
        const response = await fetch(`/api/documents/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify({
            document_ids: limitedDocumentIds,
            return_vectors: false,
            return_properties: [
              'document_id',
              'title',
              'document_type',
              'date_issued',
              'document_number',
              'summary',
            ],
          }),
        });

        if (response.status === 401) {
          throw new SourceDocumentsError('Your session has expired. Please sign in again.', 401);
        }

        if (!response.ok || response.redirected) {
          throw new SourceDocumentsError('Failed to fetch source documents', response.status);
        }

        const result = await response.json();

        let fetchedDocuments: (SearchDocument | null | undefined)[] = [];

        if (Array.isArray(result)) {
          fetchedDocuments = result;
        } else if (Array.isArray(result?.documents)) {
          fetchedDocuments = result.documents;
        }

        // 1) Normalize/unwrap -> SearchDocument[]
        const unwrappedDocs: SearchDocument[] = (fetchedDocuments ?? [])
          .map((item: any) => (item && typeof item === "object" && "document" in item ? item.document : item))
          .filter((doc: any): doc is SearchDocument => doc && doc.document_id != null);

        // 2) Build a map by document_id (stringified for safety)
        const docMap = new Map<string, SearchDocument>(
          unwrappedDocs.map((doc) => [cleanDocumentIdForUrl(doc.document_id), doc] as const)
        );

        // 3) Resolve requested IDs to docs (or "not found" placeholders).
        // Reached only after a successful 200, so a missing id is genuinely missing.
        const finalData = limitedDocumentIds.map((id) => {
          const key = String(id);
          const found = docMap.get(key);
          if (found) return found;

          logger.warn(`Missing document for id=${key}`);
          return createErrorPlaceholder(id, "Document was not found!");
        });

        // If we limited the IDs, add placeholders for the rest
        if (documentIds.length > MAX_SOURCE_CARDS) {
          const remainingIds = documentIds.slice(MAX_SOURCE_CARDS);
          const remainingPlaceholders = remainingIds.map(id =>
            createErrorPlaceholder(id, `+${documentIds.length - MAX_SOURCE_CARDS} more sources available`)
          );
          finalData.push(...remainingPlaceholders);
        }

        // Cache successful responses only
        cache.set(cacheKey, { data: finalData, timestamp: Date.now() });

        setData(finalData);
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }

        const error = err instanceof Error ? err : new Error('Unknown error');

        // Do not fabricate per-document "not found" cards and do not cache.
        setData(undefined);
        setIsError(true);
        setError(error);
        setIsLoading(false);
      }
    };

    fetchDocuments();

    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentIds?.join(','), enabled, retryNonce]);

  return { data, isLoading, isError, error, refetch };
}

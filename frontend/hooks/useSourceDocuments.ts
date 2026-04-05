// hooks/useSourceDocuments.ts

import { useState, useEffect, useRef } from 'react';
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
}

// Simple in-memory cache
const cache = new Map<string, { data: SearchDocument[]; timestamp: number }>();
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes


// Creates the placeholder object for a failed document
const createErrorPlaceholder = (id: string, message: string, isWeaviateError: boolean = false): SearchDocument => {
  return {
    document_id: id,
    document_type: 'error',
    summary: message,
    // Store Weaviate error flag in a way that can be accessed by components
    // We'll use a custom property that won't break the type
    ...(isWeaviateError && { _isWeaviateError: true } as any),

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
 * Uses standard React hooks with simple caching
 */
export function useSourceDocuments({ documentIds, enabled = true }: UseSourceDocumentsOptions): UseSourceDocumentsResult {
  const [data, setData] = useState<SearchDocument[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const shouldFetch = enabled && documentIds && documentIds.length > 0;

    if (!shouldFetch) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const cacheKey = documentIds.join(',');

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TIME) {
      setData(cached.data);
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

      // Limit to first 20 documents for source cards to avoid large payloads
      // Users can view more by expanding or viewing the full document
      const MAX_SOURCE_CARDS = 20;
      const limitedDocumentIds = documentIds.slice(0, MAX_SOURCE_CARDS);

      try {

        // Use POST with return_properties to fetch only metadata (optimized for source cards)
        // This matches what the metadata endpoint returns but in batch
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

        if (!response.ok) {
          throw new Error('Failed to fetch source documents');
        }

        const result = await response.json();

        let fetchedDocuments: (SearchDocument | null | undefined)[] = [];
        const errorMap = new Map<string, boolean>();

        if (Array.isArray(result)) {
          fetchedDocuments = result;
        } else if (Array.isArray(result?.documents)) {
          fetchedDocuments = result.documents;
        }

        // Build error map from API response
        if (Array.isArray(result?.errors)) {
          result.errors.forEach((err: { document_id: string; isWeaviateError?: boolean }) => {
            errorMap.set(String(err.document_id), err.isWeaviateError || false);
          });
        }

        // 1) Normalize/unwrap -> SearchDocument[]
        const unwrappedDocs: SearchDocument[] = (fetchedDocuments ?? [])
          .map((item: any) => (item && typeof item === "object" && "document" in item ? item.document : item))
          .filter((doc: any): doc is SearchDocument => doc && doc.document_id != null);

        // 2) Build a map by document_id (stringified for safety)
        const docMap = new Map<string, SearchDocument>(
          unwrappedDocs.map((doc) => [cleanDocumentIdForUrl(doc.document_id), doc] as const)
        );


        // 3) Resolve requested IDs to docs (or placeholders)
        // Only map the limited IDs we actually fetched
        const finalData = limitedDocumentIds.map((id) => {
          const key = String(id);
          const found = docMap.get(key);
          if (found) return found;

          const isWeaviateError = errorMap.get(key) || false;
          const errorMessage = isWeaviateError
            ? "Source information cannot be loaded!"
            : "Document was not found!";

          logger.warn(`⚠️ Missing document for id=${key}`, { isWeaviateError });
          return createErrorPlaceholder(id, errorMessage, isWeaviateError);
        });

        // If we limited the IDs, add placeholders for the rest
        if (documentIds.length > MAX_SOURCE_CARDS) {
          const remainingIds = documentIds.slice(MAX_SOURCE_CARDS);
          const remainingPlaceholders = remainingIds.map(id =>
            createErrorPlaceholder(id, `+${documentIds.length - MAX_SOURCE_CARDS} more sources available`, false)
          );
          finalData.push(...remainingPlaceholders);
        }
        // Update cache with the complete (mixed) data
        cache.set(cacheKey, { data: finalData, timestamp: Date.now() });

        setData(finalData);
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }

        // Check if it's a Weaviate error
        const error = err instanceof Error ? err : new Error('Unknown error');
        const errorMessage = error.message.toLowerCase();
        const isWeaviateError =
          errorMessage.includes('weaviate') ||
          errorMessage.includes('vector_db_unavailable') ||
          errorMessage.includes('503');

        // Create error placeholders for limited documents only
        if (documentIds && documentIds.length > 0) {
          const MAX_SOURCE_CARDS = 20;
          const limitedDocumentIds = documentIds.slice(0, MAX_SOURCE_CARDS);
          const errorMessage = isWeaviateError
            ? "Source information cannot be loaded!"
            : "Document was not found!";
          const errorPlaceholders = limitedDocumentIds.map(id =>
            createErrorPlaceholder(id, errorMessage, isWeaviateError)
          );

          // Add placeholder for remaining documents if any
          if (documentIds.length > MAX_SOURCE_CARDS) {
            const remainingPlaceholders = documentIds.slice(MAX_SOURCE_CARDS).map(id =>
              createErrorPlaceholder(id, `+${documentIds.length - MAX_SOURCE_CARDS} more sources available`, false)
            );
            errorPlaceholders.push(...remainingPlaceholders);
          }

          setData(errorPlaceholders);
        }

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
  }, [documentIds?.join(','), enabled]);

  return { data, isLoading, isError, error };
}

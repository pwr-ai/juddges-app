import { useState, useEffect, useCallback } from 'react';

import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import {
  summarizeDocuments,
  type SummarizeDocumentsResponse,
  extractKeyPoints,
  type ExtractKeyPointsResponse,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

import type { DocumentMetadata, SimilarDocument } from './types';

export function useDocument(documentId: string) {
  const { user, loading: authLoading } = useAuth();

  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [similarDocs, setSimilarDocs] = useState<SimilarDocument[]>([]);
  const [enrichedSimilarDocs, setEnrichedSimilarDocs] = useState<SimilarDocument[]>([]);
  const [loadingSimilarMetadata, setLoadingSimilarMetadata] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlUrl, setHtmlUrl] = useState<string>('');
  const [htmlString, setHtmlString] = useState<string | null>(null);

  // Summarization state
  const [summaryResult, setSummaryResult] = useState<SummarizeDocumentsResponse | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryType, setSummaryType] = useState<"executive"|"key_findings"|"synthesis">("executive");
  const [summaryLength, setSummaryLength] = useState<"short"|"medium"|"long">("medium");
  const [isSummaryPanelOpen, setIsSummaryPanelOpen] = useState(false);

  // Key points extraction state
  const [keyPointsResult, setKeyPointsResult] = useState<ExtractKeyPointsResponse | null>(null);
  const [isExtractingKeyPoints, setIsExtractingKeyPoints] = useState(false);
  const [keyPointsError, setKeyPointsError] = useState<string | null>(null);
  const [isKeyPointsPanelOpen, setIsKeyPointsPanelOpen] = useState(false);
  const canUseDocumentAI = Boolean(user);

  const fetchDocumentData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const metadataRes = await fetch(`/api/documents/${documentId}/metadata`, { cache: 'no-store' });
      if (!metadataRes.ok) throw new Error('Failed to fetch document metadata');
      const metadataData = await metadataRes.json();
      setMetadata(metadataData);

      const similarRes = await fetch(`/api/documents/${documentId}/similar?top_k=3`, { cache: 'no-store' });
      if (similarRes.ok) {
        const similarData = await similarRes.json();
        const similarDocuments = similarData.similar_documents || [];

        // Filter out the current document (normalize IDs for comparison)
        const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();
        const filtered = similarDocuments.filter((doc: SimilarDocument) => {
          const normalizedDocId = cleanDocumentIdForUrl(doc.document_id).toLowerCase().trim();
          return normalizedDocId !== normalizedCurrentId;
        });

        setSimilarDocs(filtered);
      } else {
        // Reset similar docs to empty array when fetch fails
        setSimilarDocs([]);
      }

      setHtmlUrl(`/api/documents/${documentId}/html`);
      const fetchHtmlRes = await fetch((`/api/documents/${documentId}/html`), { cache: 'no-store' });
      const fetchHtmlData = await fetchHtmlRes.text();

      setHtmlString(fetchHtmlData);

    } catch (err) {
      logger.error('Error fetching document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (documentId) fetchDocumentData();
  }, [documentId, fetchDocumentData]);

  // Fetch metadata for similar documents
  useEffect(() => {
    async function fetchSimilarDocsMetadata(): Promise<void> {
      if (similarDocs.length === 0) {
        setEnrichedSimilarDocs([]);
        return;
      }

      try {
        setLoadingSimilarMetadata(true);
        const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();

        const enriched = await Promise.all(
          similarDocs.map(async (doc) => {
            try {
              const cleanId = cleanDocumentIdForUrl(doc.document_id);
              const normalizedDocId = cleanId.toLowerCase().trim();

              // Double-check: skip if this is the current document
              if (normalizedDocId === normalizedCurrentId) {
                return null;
              }

              const metadataRes = await fetch(`/api/documents/${cleanId}/metadata`, { cache: 'no-store' });
              if (metadataRes.ok) {
                const metadataData = await metadataRes.json();
                return {
                  ...doc,
                  ...metadataData,
                } as SimilarDocument;
              }
            } catch (err) {
              logger.error(`Error fetching metadata for ${doc.document_id}:`, err);
            }
            return doc;
          })
        );

        // Filter out any null values (excluded documents)
        const filtered = enriched.filter((doc): doc is SimilarDocument => doc !== null);
        setEnrichedSimilarDocs(filtered);
      } catch (err) {
        logger.error('Error fetching similar documents metadata:', err);
        // Also filter the fallback
        const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();
        const filtered = similarDocs.filter((doc: SimilarDocument) => {
          const normalizedDocId = cleanDocumentIdForUrl(doc.document_id).toLowerCase().trim();
          return normalizedDocId !== normalizedCurrentId;
        });
        setEnrichedSimilarDocs(filtered);
      } finally {
        setLoadingSimilarMetadata(false);
      }
    }

    fetchSimilarDocsMetadata();
  }, [similarDocs, documentId]);

  // Print handler - same logic as navbar button
  const handlePrint = useCallback(async (): Promise<void> => {
    if (!htmlUrl) return;

    try {
      const res = await fetch(htmlUrl, { cache: 'no-store' });
      const htmlString = await res.text();

      const printWindow = window.open('', '_blank');
      if (printWindow && htmlString) {
        printWindow.document.write(htmlString);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 500);
      }
    } catch (error) {
      logger.error('Failed to print document:', error);
    }
  }, [htmlUrl]);

  const handleGenerateSummary = useCallback(async (): Promise<void> => {
    if (!documentId) return;

    try {
      setIsSummarizing(true);
      setSummaryError(null);
      setSummaryResult(null);

      const result = await summarizeDocuments({
        document_ids: [documentId],
        summary_type: summaryType,
        length: summaryLength,
      });

      setSummaryResult(result);
    } catch (err) {
      logger.error('Error generating summary:', err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setIsSummarizing(false);
    }
  }, [documentId, summaryType, summaryLength]);

  const handleExtractKeyPoints = useCallback(async (): Promise<void> => {
    if (!documentId) return;

    try {
      setIsExtractingKeyPoints(true);
      setKeyPointsError(null);
      setKeyPointsResult(null);

      const result = await extractKeyPoints({
        document_id: documentId,
      });

      setKeyPointsResult(result);
    } catch (err) {
      logger.error('Error extracting key points:', err);
      setKeyPointsError(err instanceof Error ? err.message : 'Failed to extract key points');
    } finally {
      setIsExtractingKeyPoints(false);
    }
  }, [documentId]);

  // Intercept Ctrl+P / Cmd+P keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Check for Ctrl+P (Windows/Linux) or Cmd+P (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault(); // Prevent default browser print dialog
        handlePrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlePrint]);

  return {
    authLoading,
    metadata,
    similarDocs,
    enrichedSimilarDocs,
    loadingSimilarMetadata,
    loading,
    error,
    htmlString,
    summaryResult,
    isSummarizing,
    summaryError,
    summaryType,
    setSummaryType,
    summaryLength,
    setSummaryLength,
    isSummaryPanelOpen,
    setIsSummaryPanelOpen,
    keyPointsResult,
    isExtractingKeyPoints,
    keyPointsError,
    isKeyPointsPanelOpen,
    setIsKeyPointsPanelOpen,
    canUseDocumentAI,
    fetchDocumentData,
    handleGenerateSummary,
    handleExtractKeyPoints,
  };
}

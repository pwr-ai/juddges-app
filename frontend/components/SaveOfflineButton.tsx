"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { Button } from "@/lib/styles/components";
import {
  saveDocumentOffline,
  removeOfflineDocument,
  isDocumentSavedOffline,
  type OfflineDocument,
} from "@/lib/offline-documents";

interface SaveOfflineButtonProps {
  documentId: string;
  title?: string | null;
  documentType?: string | null;
  fullText?: string | null;
  htmlContent?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

export function SaveOfflineButton({
  documentId,
  title,
  documentType,
  fullText,
  htmlContent,
  summary,
  metadata = {},
}: SaveOfflineButtonProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    isDocumentSavedOffline(documentId).then((saved) => {
      setIsSaved(saved);
      setChecked(true);
    });
  }, [documentId]);

  const handleToggle = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSaved) {
        await removeOfflineDocument(documentId);
        setIsSaved(false);

        // Tell the service worker to remove cached document data
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "REMOVE_CACHED_DOCUMENT",
            url: `/api/documents/${documentId}/metadata`,
          });
          navigator.serviceWorker.controller.postMessage({
            type: "REMOVE_CACHED_DOCUMENT",
            url: `/api/documents/${documentId}/html`,
          });
        }
      } else {
        // Fetch HTML content if not provided
        let html = htmlContent;
        if (!html) {
          try {
            const res = await fetch(`/api/documents/${documentId}/html`);
            if (res.ok) {
              html = await res.text();
            }
          } catch {
            // HTML content not available — save without it
          }
        }

        const doc: OfflineDocument = {
          id: documentId,
          title: title ?? null,
          documentType: documentType ?? null,
          fullText: fullText ?? null,
          htmlContent: html ?? null,
          summary: summary ?? null,
          metadata,
          savedAt: new Date().toISOString(),
        };
        await saveDocumentOffline(doc);
        setIsSaved(true);

        // Tell the service worker to cache the document API responses
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "CACHE_DOCUMENT",
            url: `/api/documents/${documentId}/metadata`,
            data: metadata,
          });
          if (html) {
            navigator.serviceWorker.controller.postMessage({
              type: "CACHE_DOCUMENT_HTML",
              url: `/api/documents/${documentId}/html`,
              html,
            });
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSaved, documentId, title, documentType, fullText, htmlContent, summary, metadata]);

  if (!checked) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
      title={isSaved ? "Remove from offline" : "Save for offline reading"}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSaved ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isSaved ? "Saved Offline" : "Save Offline"}
    </Button>
  );
}

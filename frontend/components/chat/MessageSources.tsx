// components/chat/MessageSources.tsx

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { SourcesBadge } from './SourcesBadge'; // DISABLED: Replaced with CollapsibleButton
import { SourceCard } from './SourceCard'; // KEPT: Functionality preserved but rendering disabled
import { CollapsibleButton, DocumentCard, BaseCard } from '@/lib/styles/components';
import { BookOpen } from 'lucide-react';
import { useSourceDocuments } from '@/hooks/useSourceDocuments';
import { SearchDocument } from '@/types/search';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { useChatContext } from '@/contexts/ChatContext';
import { cn } from '@/lib/utils';

interface MessageSourcesProps {
  documentIds?: string[];
  renderBadgeOnly?: boolean; // Only render the badge, not the expanded content
  renderExpandedOnly?: boolean; // Only render the expanded content, not the badge
  isExpanded?: boolean; // External state for expanded state
  onToggle?: () => void; // External toggle handler
}

export function MessageSources({ documentIds, renderBadgeOnly = false, renderExpandedOnly = false, isExpanded: externalIsExpanded, onToggle: externalOnToggle }: MessageSourcesProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const { chatId } = useChatContext();
  
  // Use external state if provided, otherwise use internal state
  const isExpandedState = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const handleToggle = externalOnToggle || (() => setInternalIsExpanded(prev => !prev));

  // All hooks must be called before any conditional returns
  const sourcesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastCardRef = useRef<HTMLDivElement | null>(null);
  const prevIsLoadingRef = useRef<boolean>(false);
  const hasScrolledRef = useRef<boolean>(false);
  const lastDocumentsLengthRef = useRef<number>(0);

  // Remove /doc prefix from documentIds (handle undefined case)
  const cleanedDocumentIds = documentIds?.map(id => cleanDocumentIdForUrl(String(id))) || [];

  // Only fetch when expanded
  const { data: documents, isLoading, error } = useSourceDocuments({
    documentIds: cleanedDocumentIds,
    enabled: isExpandedState && cleanedDocumentIds.length > 0,
  });

  // Scroll function
  const performScroll = useCallback(() => {
    // Try to use the ref first (most reliable)
    if (lastCardRef.current) {
      lastCardRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
      return;
    }
    
    // Fallback: Find the grid container with source cards
    if (sourcesContainerRef.current) {
      const gridContainer = sourcesContainerRef.current.querySelector('.grid');
      
      if (gridContainer) {
        // Get all card wrapper divs (children of the grid)
        const cardWrappers = Array.from(gridContainer.children);
        
        if (cardWrappers.length > 0) {
          // Scroll to the last card wrapper
          const lastCard = cardWrappers[cardWrappers.length - 1] as HTMLElement;
          lastCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          return;
        }
        
        // Fallback: scroll to the grid container itself
        gridContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        return;
      }
      
      // Fallback: scroll to the container
      sourcesContainerRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
    }
  }, []);

  // Scroll when expanded
  useEffect(() => {
    // Reset scroll flag when collapsed
    if (!isExpandedState) {
      hasScrolledRef.current = false;
      return;
    }

    // Scroll once when expanded
    if (isExpandedState && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      
      // Wait for DOM to update, then scroll
      const scrollTimeout = setTimeout(() => {
        performScroll();
      }, 150); // Small delay for DOM update

      return () => clearTimeout(scrollTimeout);
    }
  }, [isExpandedState, performScroll]);

  // Scroll when documents finish loading
  useEffect(() => {
    // Check if loading just finished and documents are available
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (wasLoading && !isLoading && isExpandedState && documents && documents.length > 0) {
      // Wait for first few cards to appear, then scroll (don't wait for all animations)
      const scrollTimeout = setTimeout(() => {
        performScroll();
      }, 400); // Wait for first few cards to start animating

      return () => clearTimeout(scrollTimeout);
    }
  }, [isLoading, isExpandedState, documents, performScroll]);


  // If only rendering badge, return just the badge
  if (renderBadgeOnly) {
    return (
      <CollapsibleButton
        isExpanded={isExpandedState}
        onClick={handleToggle}
        isLoading={isLoading}
        leadingIcon={BookOpen}
      >
        {cleanedDocumentIds.length} {cleanedDocumentIds.length === 1 ? 'source' : 'sources'} cited
      </CollapsibleButton>
    );
  }

  // If only rendering expanded content, return just the expanded content
  if (renderExpandedOnly) {
    return (
      <>
        {isExpandedState && (
        <div ref={sourcesContainerRef} className="mt-3 space-y-3">
          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed to load sources. Please try again.</span>
            </div>
          )}

          {/* Loading state - show when loading OR when expanded but no documents yet */}
          {(isLoading || (!documents && isExpandedState)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cleanedDocumentIds.slice(0, 3).map((id, index) => (
                <div
                  key={id}
                  className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-950 animate-pulse opacity-0"
                  style={{
                    animation: `fadeInSlide 500ms ease-out forwards, pulse 2s ease-in-out infinite`,
                    animationDelay: `${index * 150}ms, ${index * 150}ms`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Check for Weaviate errors */}
          {documents && documents.length > 0 && (() => {
            const weaviateErrors = documents.filter((doc: SearchDocument) => (doc as any)?._isWeaviateError);
            const validDocuments = documents.filter((doc: SearchDocument) => !(doc as any)?._isWeaviateError);
            const hasWeaviateErrors = weaviateErrors.length > 0;

            return (
              <>
                {/* Single error card for all Weaviate errors - aligned with sources button using same grid structure */}
                {hasWeaviateErrors && (
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="flex justify-start">
                      <BaseCard
                        clickable={false}
                        className={cn(
                          "rounded-xl",
                          "border-red-200/50 dark:border-red-900/30",
                          "bg-gradient-to-br from-red-50/50 via-red-50/50 to-orange-50/30 dark:from-red-950/30 dark:via-red-950/20 dark:to-orange-950/20",
                          "shadow-lg shadow-red-500/10",
                          "animate-in fade-in slide-in-from-top-2 duration-300"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative flex-shrink-0">
                            <div className="absolute inset-0 bg-red-500/20 rounded-lg blur-sm" />
                            <div className="relative bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 rounded-lg p-2">
                              <AlertTriangle className="h-4 w-4 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 space-y-1 min-w-0">
                            <h3 className="font-semibold text-sm text-red-800 dark:text-red-200">
                              Source Information Unavailable
                            </h3>
                            <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                              Source information cannot be loaded. The document database is temporarily unavailable.
                            </p>
                          </div>
                        </div>
                      </BaseCard>
                    </div>
                  </div>
                )}

                {/* Document Cards - only show valid documents (not Weaviate errors) */}
                {validDocuments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {validDocuments.map((doc: SearchDocument, index) => {
                      const isLastCard = index === validDocuments.length - 1;
                      return (
                        <div
                          key={doc.document_id}
                          ref={isLastCard ? lastCardRef : null}
                          className="opacity-0"
                          style={{
                            animation: `fadeInSlide 500ms ease-out forwards`,
                            animationDelay: `${index * 150}ms`,
                          }}
                        >
                          <DocumentCard
                            document={doc}
                            onSaveToCollection={() => {}} // Popover is now handled internally by DocumentCard
                            from="chat"
                            chatId={chatId || undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Empty state (shouldn't happen but handle it) */}
          {!isLoading && documents && documents.length === 0 && (
            <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
              No document details available
            </div>
          )}
      </div>
        )}
      </>
    );
  }

  // Default: render both badge and expanded content
  return (
    <div className="mt-0">
      {/* Collapsed state - badge */}
      <div className="flex justify-end -mt-2">
        <CollapsibleButton
          isExpanded={isExpandedState}
          onClick={handleToggle}
          isLoading={isLoading}
          leadingIcon={BookOpen}
        >
          {cleanedDocumentIds.length} {cleanedDocumentIds.length === 1 ? 'source' : 'sources'} cited
        </CollapsibleButton>
      </div>

      {/* Expanded state - document cards */}
      {isExpandedState && (
        <div ref={sourcesContainerRef} className="mt-2 space-y-3">
          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Failed to load sources. Please try again.</span>
            </div>
          )}

          {/* Loading state - show when loading OR when expanded but no documents yet */}
          {(isLoading || (!documents && isExpandedState)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cleanedDocumentIds.slice(0, 3).map((id, index) => (
                <div
                  key={id}
                  className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-950 animate-pulse opacity-0"
                  style={{
                    animation: `fadeInSlide 500ms ease-out forwards, pulse 2s ease-in-out infinite`,
                    animationDelay: `${index * 150}ms, ${index * 150}ms`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 bg-slate-200 dark:bg-slate-800 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Check for Weaviate errors */}
          {documents && documents.length > 0 && (() => {
            const weaviateErrors = documents.filter((doc: SearchDocument) => (doc as any)?._isWeaviateError);
            const validDocuments = documents.filter((doc: SearchDocument) => !(doc as any)?._isWeaviateError);
            const hasWeaviateErrors = weaviateErrors.length > 0;

            return (
              <>
                {/* Single error card for all Weaviate errors - aligned with sources button using same grid structure */}
                {hasWeaviateErrors && (
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="flex justify-start">
                      <BaseCard
                        clickable={false}
                        className={cn(
                          "rounded-xl",
                          "border-red-200/50 dark:border-red-900/30",
                          "bg-gradient-to-br from-red-50/50 via-red-50/50 to-orange-50/30 dark:from-red-950/30 dark:via-red-950/20 dark:to-orange-950/20",
                          "shadow-lg shadow-red-500/10",
                          "animate-in fade-in slide-in-from-top-2 duration-300"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative flex-shrink-0">
                            <div className="absolute inset-0 bg-red-500/20 rounded-lg blur-sm" />
                            <div className="relative bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 rounded-lg p-2">
                              <AlertTriangle className="h-4 w-4 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 space-y-1 min-w-0">
                            <h3 className="font-semibold text-sm text-red-800 dark:text-red-200">
                              Source Information Unavailable
                            </h3>
                            <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                              Source information cannot be loaded. The document database is temporarily unavailable.
                            </p>
                          </div>
                        </div>
                      </BaseCard>
                    </div>
                  </div>
                )}

                {/* Document Cards - only show valid documents (not Weaviate errors) */}
                {validDocuments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {validDocuments.map((doc: SearchDocument, index) => {
                      const isLastCard = index === validDocuments.length - 1;
                      return (
                        <div
                          key={doc.document_id}
                          ref={isLastCard ? lastCardRef : null}
                          className="opacity-0"
                          style={{
                            animation: `fadeInSlide 500ms ease-out forwards`,
                            animationDelay: `${index * 150}ms`,
                          }}
                        >
                          <DocumentCard
                            document={doc}
                            onSaveToCollection={() => {}} // Popover is now handled internally by DocumentCard
                            from="chat"
                            chatId={chatId || undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Empty state (shouldn't happen but handle it) */}
          {!isLoading && documents && documents.length === 0 && (
            <div className="text-sm text-muted-foreground text-center p-4 border border-dashed rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
              No document details available
            </div>
          )}
      </div>
      )}
    </div>
  );
}

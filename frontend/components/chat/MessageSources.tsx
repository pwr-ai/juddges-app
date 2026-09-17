// components/chat/MessageSources.tsx

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CollapsibleButton, DocumentCard } from '@/lib/styles/components';
import { EditorialCard } from '@/components/editorial';
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
 <div className="flex items-center gap-2 font-mono text-xs text-oxblood p-3 bg-parchment-deep rounded-none border border-oxblood/40">
 <AlertCircle className="h-4 w-4 shrink-0"/>
 <span>Failed to load sources. Please try again.</span>
 </div>
 )}

 {/* Loading state - show when loading OR when expanded but no documents yet */}
 {(isLoading || (!documents && isExpandedState)) && (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {cleanedDocumentIds.slice(0, 3).map((id, index) => (
 <div
 key={id}
 className="border border-rule rounded-none p-4 bg-parchment-deep animate-pulse opacity-0"
 style={{
 animation: `fadeInSlide 500ms ease-out forwards, pulse 2s ease-in-out infinite`,
 animationDelay: `${index * 150}ms, ${index * 150}ms`,
 }}
 >
 <div className="flex items-start gap-3 mb-3">
 <div className="w-9 h-9 bg-rule rounded-none"/>
 <div className="flex-1 space-y-2">
 <div className="h-4 bg-rule rounded-none w-3/4"/>
 <div className="h-3 bg-rule rounded-none w-1/2"/>
 </div>
 </div>
 <div className="space-y-2">
 <div className="h-3 bg-rule rounded-none w-full"/>
 <div className="h-3 bg-rule rounded-none w-5/6"/>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Check for database errors */}
 {documents && documents.length > 0 && (() => {
 const databaseErrors = documents.filter((doc: SearchDocument) => (doc as any)?._isDatabaseError);
 const validDocuments = documents.filter((doc: SearchDocument) => !(doc as any)?._isDatabaseError);
 const hasDatabaseErrors = databaseErrors.length > 0;

 return (
 <>
 {/* Single error card for all database errors - aligned with sources button using same grid structure */}
 {hasDatabaseErrors && (
 <div className="grid grid-cols-2 gap-2 items-center">
 <div className="flex justify-start">
 <EditorialCard
							flat
							className="p-4 border-oxblood/40 bg-parchment-deep"
						>
							<div className="flex items-start gap-3">
								<AlertTriangle className="h-5 w-5 text-oxblood shrink-0 mt-0.5" />
								<div className="flex-1 space-y-1 min-w-0">
									<h4 className="font-serif font-semibold text-sm text-oxblood">
										Source Information Unavailable
									</h4>
									<p className="text-xs font-mono text-ink-soft leading-relaxed">
										Source information cannot be loaded. The document database is temporarily unavailable.
									</p>
								</div>
							</div>
						</EditorialCard>
 </div>
 </div>
 )}

 {/* Document Cards - only show valid documents (not database errors) */}
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
 <div className="font-mono text-xs text-ink-soft text-center p-4 border border-dashed border-rule rounded-none">
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
 <div className="mt-0"data-testid="message-sources">
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
 <div className="flex items-center gap-2 text-sm text-red-600 p-3 bg-red-50 rounded-lg border border-red-200 animate-in fade-in slide-in-from-top-2 duration-300">
 <AlertCircle className="h-4 w-4 shrink-0"/>
 <span>Failed to load sources. Please try again.</span>
 </div>
 )}

 {/* Loading state - show when loading OR when expanded but no documents yet */}
 {(isLoading || (!documents && isExpandedState)) && (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {cleanedDocumentIds.slice(0, 3).map((id, index) => (
 <div
 key={id}
 className="border border-rule rounded-none p-4 bg-parchment-deep animate-pulse opacity-0"
 style={{
 animation: `fadeInSlide 500ms ease-out forwards, pulse 2s ease-in-out infinite`,
 animationDelay: `${index * 150}ms, ${index * 150}ms`,
 }}
 >
 <div className="flex items-start gap-3 mb-3">
 <div className="w-9 h-9 bg-rule rounded-none"/>
 <div className="flex-1 space-y-2">
 <div className="h-4 bg-rule rounded-none w-3/4"/>
 <div className="h-3 bg-rule rounded-none w-1/2"/>
 </div>
 </div>
 <div className="space-y-2">
 <div className="h-3 bg-rule rounded-none w-full"/>
 <div className="h-3 bg-rule rounded-none w-5/6"/>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Check for database errors */}
 {documents && documents.length > 0 && (() => {
 const databaseErrors = documents.filter((doc: SearchDocument) => (doc as any)?._isDatabaseError);
 const validDocuments = documents.filter((doc: SearchDocument) => !(doc as any)?._isDatabaseError);
 const hasDatabaseErrors = databaseErrors.length > 0;

 return (
 <>
 {/* Single error card for all database errors - aligned with sources button using same grid structure */}
 {hasDatabaseErrors && (
 <div className="grid grid-cols-2 gap-2 items-center">
 <div className="flex justify-start">
 <EditorialCard
							flat
							className="p-4 border-oxblood/40 bg-parchment-deep"
						>
							<div className="flex items-start gap-3">
								<AlertTriangle className="h-5 w-5 text-oxblood shrink-0 mt-0.5" />
								<div className="flex-1 space-y-1 min-w-0">
									<h4 className="font-serif font-semibold text-sm text-oxblood">
										Source Information Unavailable
									</h4>
									<p className="text-xs font-mono text-ink-soft leading-relaxed">
										Source information cannot be loaded. The document database is temporarily unavailable.
									</p>
								</div>
							</div>
						</EditorialCard>
 </div>
 </div>
 )}

 {/* Document Cards - only show valid documents (not database errors) */}
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
 <div className="font-mono text-xs text-ink-soft text-center p-4 border border-dashed border-rule rounded-none">
 No document details available
 </div>
 )}
 </div>
 )}
 </div>
 );
}

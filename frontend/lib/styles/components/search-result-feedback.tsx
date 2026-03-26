/**
 * Search Result Feedback Component
 * Specialized feedback component for search results with enriched context
 * Captures comprehensive data for building evaluation datasets
 */

'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import logger from '@/lib/logger';

/**
 * Search context for evaluation dataset
 */
export interface SearchFeedbackContext {
 // Filters state
 filters: {
 courts?: string[];
 date_from?: string | null;
 date_to?: string | null;
 document_types?: string[];
 languages?: string[];
 keywords?: string[];
 legal_concepts?: string[];
 issuing_bodies?: string[];
 };
 // Search parameters
 search_params: {
 mode: 'rabbit' | 'thinking' | 'hybrid' | 'semantic' | 'keyword';
 embedding_model?: string;
 top_k?: number;
 reranking_enabled?: boolean;
 reranking_model?: string;
 };
 // Result context
 result_context: {
 total_results: number;
 retrieval_score?: number | null;
 reranking_score?: number | null;
 /** Position of this document in the results (1-based) */
 position?: number;
 /** Total loaded documents (for infinite scroll) */
 loaded_count?: number;
 /** @deprecated Use position and loaded_count instead */
 page_number?: number;
 /** @deprecated Use position and loaded_count instead */
 page_size?: number;
 };
 // Document identifiers and metadata
 document: {
 document_id: string;
 document_number?: string | null;
 uuid?: string;
 title?: string | null;
 document_type?: string | null;
 court?: string | null;
 date?: string | null;
 language?: string | null;
 canton?: string | null;
 country?: string | null;
 };
 // User interaction timing
 interaction: {
 search_timestamp: string;
 feedback_timestamp?: string;
 time_to_feedback_ms?: number;
 document_opened?: boolean;
 chunks_expanded?: boolean;
 };
 // Chunk information (if feedback is on specific chunk)
 chunk_info?: {
 chunk_id?: string | number;
 chunk_score?: number;
 chunk_position?: number;
 chunk_text?: string;
 };
 // All chunks displayed for this document
 chunks?: Array<{
 chunk_id?: string | number;
 chunk_text?: string;
 chunk_score?: number;
 position?: number;
 }>;
}

export interface SearchResultFeedbackProps {
 /**
 * Unique identifier for the document receiving feedback
 */
 documentId: string;
 /**
 * The search query that returned this result
 */
 searchQuery: string;
 /**
 * Position of this result in search results (1-based)
 */
 resultPosition: number;
 /**
 * Full search context for evaluation dataset
 */
 searchContext: SearchFeedbackContext;
 /**
 * Optional className for container styling
 */
 className?: string;
 /**
 * Optional callback when feedback is submitted
 */
 onFeedbackSubmit?: (rating: 'relevant' | 'not_relevant') => void;
}

/**
 * SearchResultFeedback Component
 *
 * Features:
 * - Thumbs up (relevant) / thumbs down (not relevant) buttons
 * - Captures comprehensive search context for evaluation
 * - Stores all data in search_context JSONB field
 * - Accessible with proper ARIA labels and keyboard navigation
 *
 * @example
 * <SearchResultFeedback
 * documentId="doc_123"
 * searchQuery="VAT deduction rules"
 * resultPosition={1}
 * searchContext={context}
 * />
 */
export function SearchResultFeedback({
 documentId,
 searchQuery,
 resultPosition,
 searchContext,
 className,
 onFeedbackSubmit,
}: SearchResultFeedbackProps): React.JSX.Element {
 const feedbackLogger = logger.child('SearchResultFeedback');
 const [feedbackState, setFeedbackState] = useState<'relevant' | 'not_relevant' | null>(null);
 const [isSubmitting, setIsSubmitting] = useState(false);

 const handleFeedback = async (rating: 'relevant' | 'not_relevant'): Promise<void> => {
 // Toggle off if clicking the same rating
 if (feedbackState === rating) {
 setFeedbackState(null);
 return;
 }

 setIsSubmitting(true);
 setFeedbackState(rating);

 try {
 const supabase = createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 // Prepare enriched search context with timestamps
 const now = new Date();
 const enrichedContext: SearchFeedbackContext = {
 ...searchContext,
 interaction: {
 ...searchContext.interaction,
 feedback_timestamp: now.toISOString(),
 time_to_feedback_ms: searchContext.interaction.search_timestamp
 ? now.getTime() - new Date(searchContext.interaction.search_timestamp).getTime()
 : undefined,
 },
 };

 // Prepare feedback data
 const feedbackData = {
 document_id: documentId,
 search_query: searchQuery,
 rating: rating,
 user_id: user?.id || null,
 session_id: typeof window !== 'undefined' ? sessionStorage.getItem('session_id') : null,
 result_position: resultPosition,
 reason: null, // Could add optional comment dialog later
 search_context: enrichedContext,
 created_at: now.toISOString(),
 };

 const { error } = await supabase
 .from('search_feedback')
 .insert(feedbackData);

 if (error) {
 throw error;
 }

 feedbackLogger.info('Search feedback submitted', {
 documentId,
 rating,
 resultPosition,
 searchQuery: searchQuery.substring(0, 50)
 });

 toast.success(
 rating === 'relevant'
 ? 'Thanks! This helps improve search results.'
 : 'Thanks for the feedback! We\'ll work on improving relevance.'
 );

 if (onFeedbackSubmit) {
 onFeedbackSubmit(rating);
 }
 } catch (error) {
 feedbackLogger.error('Error submitting search feedback', error, {
 documentId,
 rating,
 context: 'submitFeedback'
 });

 // Revert state on error
 setFeedbackState(null);
 toast.error('Failed to submit feedback. Please try again.');
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className={cn('inline-flex items-center gap-1', className)}>
 {/* Thumbs Up - Document is relevant */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleFeedback('relevant');
 }}
 disabled={isSubmitting}
 className={cn(
 'group relative inline-flex items-center justify-center p-1.5 rounded-lg',
 'transition-all duration-200 active:scale-95',
 'border border-transparent',
 'hover:bg-green-50',
 'hover:text-green-600',
 'hover:border-green-200',
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1',
 feedbackState === 'relevant' && 'bg-green-50 border-green-200',
 isSubmitting && 'opacity-50 cursor-not-allowed'
 )}
 title="This document is relevant for this query"
 aria-label="This document is relevant for this query"
 >
 <ThumbsUp
 size={14}
 className={cn(
 'transition-colors',
 feedbackState === 'relevant' ? 'text-green-500 fill-green-500' : 'text-slate-400'
 )}
 />
 </button>

 {/* Thumbs Down - Document is not relevant */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleFeedback('not_relevant');
 }}
 disabled={isSubmitting}
 className={cn(
 'group relative inline-flex items-center justify-center p-1.5 rounded-lg',
 'transition-all duration-200 active:scale-95',
 'border border-transparent',
 'hover:bg-red-50',
 'hover:text-red-600',
 'hover:border-red-200',
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1',
 feedbackState === 'not_relevant' && 'bg-red-50 border-red-200',
 isSubmitting && 'opacity-50 cursor-not-allowed'
 )}
 title="This document is not relevant for this query"
 aria-label="This document is not relevant for this query"
 >
 <ThumbsDown
 size={14}
 className={cn(
 'transition-colors',
 feedbackState === 'not_relevant' ? 'text-red-500 fill-red-500' : 'text-slate-400'
 )}
 />
 </button>
 </div>
 );
}

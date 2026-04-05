/**
 * Item Feedback Component
 * Generic feedback system for any content type (messages, documents, search results, etc.)
 * Provides thumbs up/down buttons with optional comment dialog
 * WCAG AA compliant with proper accessibility features
 */

'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
 DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';

export interface ItemFeedbackProps {
 /**
 * Unique identifier for the item receiving feedback
 */
 itemId: string;
 /**
 * Type of item (determines which database table to use)
 */
 itemType: 'message' | 'document' | 'search_result';
 /**
 * Optional className for container styling
 */
 className?: string;
 /**
 * Optional callback when feedback state changes
 */
 onFeedbackChange?: (feedbackType: 'liked' | 'disliked' | null) => void;
}

/**
 * Generic ItemFeedback Component
 *
 * Features:
 * - Thumbs up/down buttons with WCAG AA compliant colors
 * - Keyboard navigation support
 * - Optional comment dialog
 * - Supabase integration
 * - Accessible tooltips and ARIA labels
 * - Proper focus management
 *
 * @example
 * <ItemFeedback
 * itemId="msg-123"
 * itemType="message"
 * onFeedbackChange={(type) => console.log('Feedback:', type)}
 * />
 */
export function ItemFeedback({
 itemId,
 itemType,
 className,
 onFeedbackChange,
}: ItemFeedbackProps): React.JSX.Element {
 const feedbackLogger = logger.child('ItemFeedback');
 const [feedbackState, setFeedbackState] = useState<'liked' | 'disliked' | null>(null);
 const [commentDialogOpen, setCommentDialogOpen] = useState(false);
 const [feedbackComment, setFeedbackComment] = useState('');
 const [pendingFeedbackType, setPendingFeedbackType] = useState<'liked' | 'disliked' | null>(null);

 // Get the appropriate table name based on item type
 const getFeedbackTableName = (): string => {
 switch (itemType) {
 case 'message':
 return 'message_feedback';
 case 'document':
 return 'document_feedback';
 case 'search_result':
 return 'search_feedback';
 default:
 return 'message_feedback';
 }
 };

 // Get the appropriate item table name
 const getItemTableName = (): string => {
 switch (itemType) {
 case 'message':
 return 'messages';
 case 'document':
 return 'documents';
 case 'search_result':
 return 'search_results';
 default:
 return 'messages';
 }
 };

 // Get the appropriate foreign key column name
 const getForeignKeyColumn = (): string => {
 switch (itemType) {
 case 'message':
 return 'message_id';
 case 'document':
 return 'document_id';
 case 'search_result':
 return 'search_result_id';
 default:
 return 'message_id';
 }
 };

 // Handle feedback button click
 const handleFeedback = async (feedback: 'liked' | 'disliked'): Promise<void> => {
 // Check if already submitted the same feedback (toggle off)
 if (feedbackState === feedback) {
 setFeedbackState(null);
 if (onFeedbackChange) {
 onFeedbackChange(null);
 }

 try {
 const supabase = createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();

 if (!user) {
 feedbackLogger.error('Cannot remove feedback: User not authenticated');
 toast.error('You need to be logged in to remove feedback');
 return;
 }

 // Delete the feedback entry
 const { error } = await supabase
 .from(getFeedbackTableName())
 .delete()
 .eq(getForeignKeyColumn(), itemId)
 .eq('user_id', user.id);

 if (error) {
 throw error;
 }

 toast.success('Feedback removed');
 } catch (error) {
 feedbackLogger.error('Error removing feedback', error, { itemId, itemType, context: 'removeFeedback' });
 // Restore the previous state
 setFeedbackState(feedback);
 if (onFeedbackChange) {
 onFeedbackChange(feedback);
 }
 toast.error('Failed to remove feedback. Please try again.');
 }
 return;
 }

 // Set local state for immediate UI feedback
 setFeedbackState(feedback);
 setPendingFeedbackType(feedback);
 if (onFeedbackChange) {
 onFeedbackChange(feedback);
 }

 // Open dialog for optional comment
 setCommentDialogOpen(true);
 };

 // Handle feedback submission with optional comment
 const handleFeedbackSubmit = async (): Promise<void> => {
 if (!pendingFeedbackType) return;

 try {
 // Health check for database connection
 const supabase = createClient();
 const { error: healthCheckError } = await supabase
 .from(getFeedbackTableName())
 .select('count')
 .limit(1);

 if (healthCheckError) {
 feedbackLogger.error('Database connection error', healthCheckError, { context: 'saveFeedback' });
 toast.error('Error connecting to the database. Please try again later.');
 return;
 }

 await saveFeedback(itemId, pendingFeedbackType, feedbackComment);
 toast.success('Thank you for your feedback!');
 } catch (error) {
 feedbackLogger.error('Error saving feedback', error, {
 itemId,
 itemType,
 feedbackType: pendingFeedbackType,
 context: 'saveFeedback'
 });

 // Revert the state
 setFeedbackState(null);
 if (onFeedbackChange) {
 onFeedbackChange(null);
 }

 // Detailed error message
 if (error instanceof Error) {
 toast.error(`Failed to submit feedback: ${error.message}`);
 } else {
 toast.error('Failed to submit feedback. Please try again.');
 }
 } finally {
 setCommentDialogOpen(false);
 setFeedbackComment('');
 setPendingFeedbackType(null);
 }
 };

 // Save feedback to Supabase
 const saveFeedback = async (
 id: string,
 feedbackType: 'liked' | 'disliked',
 comment?: string
 ): Promise<void> => {
 if (!id || !feedbackType) return;

 try {
 // First, ensure the item exists in the database
 await ensureItemExists(id);

 // Get the current user
 const supabase = createClient();
 const {
 data: { user },
 } = await supabase.auth.getUser();
 if (!user) throw new Error('User not authenticated');

 const foreignKeyColumn = getForeignKeyColumn();

 // Check if feedback already exists
 const { data: existingFeedback } = await supabase
 .from(getFeedbackTableName())
 .select('id')
 .eq(foreignKeyColumn, id)
 .eq('user_id', user.id)
 .maybeSingle();

 const now = new Date().toISOString();

 if (existingFeedback) {
 // Update existing feedback
 const { error: updateError } = await supabase
 .from(getFeedbackTableName())
 .update({
 feedback_type: feedbackType,
 comment: comment || null,
 updated_at: now,
 })
 .eq('id', existingFeedback.id);

 if (updateError) {
 logger.error('Error updating feedback:', updateError);
 throw updateError;
 }
 } else {
 // Insert new feedback
 const feedbackData: Record<string, unknown> = {
 id: uuidv4(),
 [foreignKeyColumn]: id,
 user_id: user.id,
 feedback_type: feedbackType,
 comment: comment || null,
 created_at: now,
 updated_at: now,
 };

 const { error: insertError } = await supabase
 .from(getFeedbackTableName())
 .insert(feedbackData);

 if (insertError) {
 logger.error('Error inserting feedback:', insertError);
 throw insertError;
 }
 }
 } catch (error) {
 logger.error('Error saving feedback:', error);
 throw error;
 }
 };

 // Ensure the item exists in the database
 const ensureItemExists = async (id: string): Promise<void> => {
 try {
 const supabase = createClient();

 // Check if the item already exists in the database
 const { data: existingItem } = await supabase
 .from(getItemTableName())
 .select('id')
 .eq('id', id)
 .maybeSingle();

 if (!existingItem) {
 logger.warn(
 `${itemType} not found in database. This is normal for new items. Feedback will be saved for item ID: ${id}`
 );
 }
 } catch (error) {
 logger.error(`Error checking ${itemType} existence:`, error);
 }
 };

 return (
 <>
 <div className={cn('inline-flex items-center gap-2', className)}>
 {/* Thumbs Up Button */}
 <button
 onClick={() => handleFeedback('liked')}
 className={cn(
 'group relative inline-flex items-center justify-center p-2 rounded-lg',
 'transition-all duration-200 active:scale-95',
 'border border-transparent',
 'hover:bg-green-50',
 'hover:text-green-600',
 'hover:border-green-200',
 'hover:shadow-sm hover:shadow-green-500/5',
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2',
 feedbackState === 'liked' && 'bg-green-50 border-green-200'
 )}
 title="This was helpful"
 aria-label="This was helpful"
 >
 <ThumbsUp
 size={16}
 className={cn(
 'transition-colors',
 feedbackState === 'liked' && 'text-green-500 fill-green-500'
 )}
 />
 </button>

 {/* Thumbs Down Button */}
 <button
 onClick={() => handleFeedback('disliked')}
 className={cn(
 'group relative inline-flex items-center justify-center p-2 rounded-lg',
 'transition-all duration-200 active:scale-95',
 'border border-transparent',
 'hover:bg-red-50',
 'hover:text-red-600',
 'hover:border-red-200',
 'hover:shadow-sm hover:shadow-red-500/5',
 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
 feedbackState === 'disliked' && 'bg-red-50 border-red-200'
 )}
 title="This wasn't helpful"
 aria-label="This wasn't helpful"
 >
 <ThumbsDown
 size={16}
 className={cn(
 'transition-colors',
 feedbackState === 'disliked' && 'text-red-500 fill-red-500'
 )}
 />
 </button>
 </div>

 {/* Feedback Comment Dialog */}
 <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
 <DialogContent className="sm:max-w-[500px]">
 <DialogHeader>
 <DialogTitle>Provide Additional Feedback</DialogTitle>
 <DialogDescription>
 {pendingFeedbackType === 'liked'
 ? 'Thanks for the positive feedback! Please share what you found helpful (optional).'
 : 'We appreciate your feedback. Please tell us how we can improve (optional).'}
 </DialogDescription>
 </DialogHeader>
 <div className="grid gap-4 py-4">
 <Textarea
 placeholder="Your comments (optional)"
 value={feedbackComment}
 onChange={(e) => setFeedbackComment(e.target.value)}
 className="min-h-[100px]"
 aria-label="Feedback comment"
 />
 </div>
 <DialogFooter>
 <Button
 variant="outline"
 onClick={() => {
 setCommentDialogOpen(false);
 setFeedbackComment('');
 setPendingFeedbackType(null);
 }}
 >
 Cancel
 </Button>
 <Button onClick={handleFeedbackSubmit}>Submit Feedback</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 );
}

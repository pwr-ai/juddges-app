'use client';

import { ErrorBoundary } from './ErrorBoundary';
import { MessageCircle, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { logger } from "@/lib/logger";

/**
 * Chat Error Fallback Component
 *
 * Specialized error UI for chat functionality.
 * Provides context-specific recovery options.
 */
function ChatErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
 // Check for specific error types
 const isStreamError =
 error.message.includes('stream') ||
 error.message.includes('SSE') ||
 error.message.includes('EventSource');

 const isRateLimitError =
 error.message.includes('rate limit') ||
 error.message.includes('429') ||
 error.message.includes('too many requests');

 const isAuthError =
 error.message.includes('unauthorized') ||
 error.message.includes('401') ||
 error.message.includes('authentication');

 return (
 <div className="p-8">
 <EmptyState
 icon={<AlertCircle />}
 title={
 isAuthError
 ? 'Authentication required'
 : isRateLimitError
 ? 'Rate limit reached'
 : isStreamError
 ? 'Streaming error'
 : 'Chat temporarily unavailable'
 }
 description={
 isAuthError
 ? 'Please sign in to continue using the chat feature.'
 : isRateLimitError
 ? "You've sent too many messages. Please wait a moment before sending another message."
 : isStreamError
 ? "We're having trouble streaming the response. Please try sending your message again."
 : "We're having trouble loading the chat. This is usually temporary - please try again."
 }
 action={
 isAuthError
 ? { label: 'Sign in', onClick: () => (window.location.href = '/auth/login') }
 : isRateLimitError
 ? undefined // No action for rate limit - user needs to wait
 : { label: 'Retry', onClick: reset }
 }
 />

 {process.env.NODE_ENV === 'development' && (
 <details className="mt-4 max-w-2xl mx-auto">
 <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 text-center">
 Error details (development only)
 </summary>
 <pre className="mt-2 text-xs bg-gray-100 p-4 rounded overflow-auto">
 {error.stack}
 </pre>
 </details>
 )}
 </div>
 );
}

/**
 * Chat Error Boundary
 *
 * Wraps chat components to catch and handle chat-specific errors.
 * Provides user-friendly error messages and recovery options.
 *
 * @example
 * ```tsx
 * <ChatErrorBoundary>
 * <ChatInterface />
 * </ChatErrorBoundary>
 * ```
 */
export function ChatErrorBoundary({ children }: { children: React.ReactNode }) {
 return (
 <ErrorBoundary
 fallback={ChatErrorFallback}
 onError={(error, errorInfo) => {
 // Log chat-specific errors with context
 logger.error('Chat error:', {
 error: error.message,
 stack: error.stack,
 componentStack: errorInfo.componentStack,
 timestamp: new Date().toISOString(),
 });

 // Track chat errors for analytics
 if (typeof window !== 'undefined') {
 // Example: Track to analytics
 // analytics.track('chat_error', {
 // error_message: error.message,
 // error_type: error.name,
 // });
 }
 }}
 >
 {children}
 </ErrorBoundary>
 );
}

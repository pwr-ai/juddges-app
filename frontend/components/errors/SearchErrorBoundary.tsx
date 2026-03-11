'use client';

import { ErrorBoundary } from './ErrorBoundary';
import { Search, AlertCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

/**
 * Search Error Fallback Component
 *
 * Specialized error UI for search functionality.
 * Provides context-specific recovery options.
 */
function SearchErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
 // Check if it's a network error
 const isNetworkError =
 error.message.includes('fetch') ||
 error.message.includes('network') ||
 error.message.includes('Failed to fetch');

 // Check if it's a timeout error
 const isTimeoutError = error.message.includes('timeout') || error.message.includes('aborted');

 return (
 <div className="p-8">
 <EmptyState
 icon={<AlertCircle />}
 title={
 isNetworkError
 ? 'Connection issue'
 : isTimeoutError
 ? 'Search took too long'
 : 'Search temporarily unavailable'
 }
 description={
 isNetworkError
 ? "We're having trouble connecting to the search service. Please check your internet connection and try again."
 : isTimeoutError
 ? "Your search query took too long to process. Try simplifying your query or using more specific terms."
 : "We're having trouble loading search results. This is usually temporary - please try again."
 }
 action={{ label: 'Retry search', onClick: reset }}
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
 * Search Error Boundary
 *
 * Wraps search components to catch and handle search-specific errors.
 * Provides user-friendly error messages and recovery options.
 *
 * @example
 * ```tsx
 * <SearchErrorBoundary>
 * <SearchResults />
 * </SearchErrorBoundary>
 * ```
 */
export function SearchErrorBoundary({ children }: { children: React.ReactNode }) {
 return (
 <ErrorBoundary
 fallback={SearchErrorFallback}
 onError={(error, errorInfo) => {
 // Log search-specific errors with context
 console.error('Search error:', {
 error: error.message,
 stack: error.stack,
 componentStack: errorInfo.componentStack,
 timestamp: new Date().toISOString(),
 });

 // Track search errors for analytics
 if (typeof window !== 'undefined') {
 // Example: Track to analytics
 // analytics.track('search_error', {
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

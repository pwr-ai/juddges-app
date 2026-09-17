'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from "@/lib/logger";
import { track } from '@/lib/analytics/track';

interface ErrorBoundaryProps {
 children: React.ReactNode;
 fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
 onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
 hasError: boolean;
 error: Error | null;
}

/**
 * Global Error Boundary Component
 *
 * Catches React errors in the component tree and displays a fallback UI.
 * Features:
 * - Custom fallback components per use case
 * - Error logging to console and optional error tracking service
 * - Reset functionality to recover from errors
 * - Development-friendly error details
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 * <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example Custom fallback
 * ```tsx
 * <ErrorBoundary fallback={CustomErrorFallback}>
 * <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
 constructor(props: ErrorBoundaryProps) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): ErrorBoundaryState {
 // Update state so the next render will show the fallback UI
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
 // Log error details to console
 logger.error('Error caught by ErrorBoundary:', error, errorInfo);

 track('error_boundary_triggered', {
 error_name: error.name,
 message: error.message?.slice(0, 200),
 });

 // Call custom error handler if provided
 if (this.props.onError) {
 this.props.onError(error, errorInfo);
 }

 // Log to error tracking service (e.g., Sentry)
 if (typeof window !== 'undefined') {
 // Example: Sentry integration
 // window.Sentry?.captureException(error, {
 // extra: errorInfo,
 // tags: { component: 'ErrorBoundary' }
 // });

 // Example: Custom error tracking
 // analytics.trackError({
 // error: error.message,
 // stack: error.stack,
 // componentStack: errorInfo.componentStack
 // });
 }
 }

 reset = () => {
 this.setState({ hasError: false, error: null });
 };

 render() {
 if (this.state.hasError && this.state.error) {
 // Use custom fallback if provided
 if (this.props.fallback) {
 const FallbackComponent = this.props.fallback;
 return <FallbackComponent error={this.state.error} reset={this.reset} />;
 }

 // Otherwise use default fallback
 return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
 }

 return this.props.children;
 }
}

/**
 * Default Error Fallback Component
 *
 * Displays a user-friendly error message with recovery options.
 * Shows error details in development mode.
 */
function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full bg-parchment rounded-none border border-rule border-l-2 border-l-oxblood p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-none border border-rule bg-parchment-deep flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-oxblood" />
            </div>
          </div>

          <div className="flex-1">
            <h2 className="font-serif text-lg text-ink mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-ink-soft mb-4">
              {error.message || 'An unexpected error occurred'}
            </p>

            {process.env.NODE_ENV === 'development' && (
              <details className="mb-4">
                <summary className="text-xs font-mono text-ink-soft cursor-pointer hover:text-ink">
                  Error details
                </summary>
                <pre className="mt-2 text-xs font-mono bg-parchment-deep border border-rule p-2 rounded-none overflow-auto max-h-40 text-ink-soft">
                  {error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <Button onClick={reset} size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/'}>
                <Home className="w-4 h-4 mr-2" />
                Go home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

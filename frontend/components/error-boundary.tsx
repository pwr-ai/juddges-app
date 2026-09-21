'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import logger from '@/lib/logger';
import { AppError, ErrorCode } from '@/lib/errors';

const errorLogger = logger.child('ErrorBoundary');

interface Props {
 children: ReactNode;
 fallback?: (error: Error, reset: () => void) => ReactNode;
 onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
 hasError: boolean;
 error?: Error;
}

/**
 * Error Boundary component to catch and handle React component errors.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 * <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={(error, reset) => (
 * <CustomErrorDisplay error={error} onRetry={reset} />
 * )}>
 * <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
 constructor(props: Props) {
 super(props);
 this.state = { hasError: false };
 }

 static getDerivedStateFromError(error: Error): State {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
 // Log to our logger
 errorLogger.error('Component error caught', error, {
 componentStack: errorInfo.componentStack,
 errorType: error.constructor.name
 });

 // Call custom error handler if provided
 this.props.onError?.(error, errorInfo);
 }

 reset = (): void => {
 this.setState({ hasError: false, error: undefined });
 };

 render(): ReactNode {
 if (this.state.hasError && this.state.error) {
 // Use custom fallback if provided
 if (this.props.fallback) {
 return this.props.fallback(this.state.error, this.reset);
 }

 // Default fallback UI
 return (
     <div className="min-h-[400px] flex items-center justify-center p-8">
 <div className="max-w-md w-full border-l-2 border-l-oxblood bg-parchment-deep p-6">
 <div className="flex items-start gap-4">
 <AlertTriangle aria-hidden className="size-6 shrink-0 text-oxblood" />
 <div className="flex-1">
 <h3 className="text-sm font-medium text-ink">
 Something went wrong
 </h3>
 <div className="mt-2 text-sm text-ink-soft">
 {this.state.error instanceof AppError ? (
 <p>{this.state.error.message}</p>
 ) : (
 <p>An unexpected error occurred. Please try again.</p>
 )}
 </div>
 <div className="mt-4">
 <button
 type="button"
 onClick={this.reset}
 className="inline-flex items-center border border-rule bg-parchment px-3 py-2 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:bg-parchment-deep focus:outline-none focus:ring-1 focus:ring-ink"
 >
 Try again
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
 }

 return this.props.children;
 }
}

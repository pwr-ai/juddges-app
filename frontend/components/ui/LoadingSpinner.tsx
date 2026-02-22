"use client";

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  /**
   * Size variant
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Optional message to display below spinner
   */
  message?: string;

  /**
   * Color variant
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'muted';
}

/**
 * LoadingSpinner - Circular loading indicator
 *
 * Use sparingly - prefer skeleton screens for content loading.
 * Best for: action buttons, form submissions, small isolated operations.
 *
 * @example
 * ```tsx
 * <LoadingSpinner />
 * <LoadingSpinner size="lg" message="Processing your request..." />
 * <LoadingSpinner variant="secondary" />
 * ```
 */
export function LoadingSpinner({
  size = 'md',
  className,
  message,
  variant = 'primary'
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
    xl: 'w-16 h-16 border-4'
  };

  const variantClasses = {
    primary: 'border-muted border-t-primary',
    secondary: 'border-muted border-t-secondary',
    muted: 'border-muted-foreground/20 border-t-muted-foreground'
  };

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={message || "Loading"}
    >
      <div
        className={cn(
          "rounded-full animate-spin",
          sizeClasses[size],
          variantClasses[variant]
        )}
        aria-hidden="true"
      />
      {message && (
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          {message}
        </p>
      )}
      <span className="sr-only">{message || "Loading..."}</span>
    </div>
  );
}

/**
 * InlineSpinner - Compact inline loading indicator
 *
 * Use inside buttons or inline with text.
 *
 * @example
 * ```tsx
 * <button disabled>
 *   <InlineSpinner /> Processing...
 * </button>
 * ```
 */
export function InlineSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin", className)}
      role="status"
      aria-hidden="true"
    />
  );
}

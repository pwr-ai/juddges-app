import { cn } from '@/lib/utils';

interface SkeletonTextProps {
  /**
   * Number of skeleton lines to display
   * @default 3
   */
  lines?: number;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Custom line widths (overrides default behavior where last line is shorter)
   * Example: ['100%', '90%', '75%']
   */
  widths?: string[];
}

/**
 * SkeletonText - Text loading skeleton component
 *
 * Displays animated placeholder lines representing text content.
 * Uses shimmer animation for visual feedback during loading states.
 *
 * @example
 * ```tsx
 * <SkeletonText lines={3} />
 * <SkeletonText lines={2} widths={['100%', '60%']} />
 * ```
 */
export function SkeletonText({
  lines = 3,
  className,
  widths
}: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Loading text">
      {Array.from({ length: lines }).map((_, i) => {
        // Use custom width if provided, otherwise make last line 75% width
        const width = widths?.[i] || (i === lines - 1 ? '75%' : '100%');

        return (
          <div
            key={i}
            className="h-4 rounded bg-muted animate-shimmer"
            style={{ width }}
            aria-hidden="true"
          />
        );
      })}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

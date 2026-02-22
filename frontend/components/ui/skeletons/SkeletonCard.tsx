import { cn } from '@/lib/utils';
import { SkeletonText } from './SkeletonText';

interface SkeletonCardProps {
  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Show metadata badges at the bottom
   * @default true
   */
  showMetadata?: boolean;

  /**
   * Number of text lines in content area
   * @default 2
   */
  contentLines?: number;
}

/**
 * SkeletonCard - Card loading skeleton component
 *
 * Displays a card-shaped placeholder matching the design system's card component.
 * Includes title, content text, and optional metadata badges.
 *
 * @example
 * ```tsx
 * <SkeletonCard />
 * <SkeletonCard showMetadata={false} contentLines={3} />
 * ```
 */
export function SkeletonCard({
  className,
  showMetadata = true,
  contentLines = 2
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4",
        "bg-card backdrop-blur-sm",
        className
      )}
      role="status"
      aria-label="Loading card"
    >
      <div className="space-y-3">
        {/* Title skeleton */}
        <div
          className="h-6 w-2/3 bg-muted rounded animate-pulse"
          aria-hidden="true"
        />

        {/* Content skeleton */}
        <SkeletonText lines={contentLines} />

        {/* Metadata badges skeleton */}
        {showMetadata && (
          <div className="flex gap-2 pt-2" aria-hidden="true">
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          </div>
        )}
      </div>
      <span className="sr-only">Loading card content...</span>
    </div>
  );
}

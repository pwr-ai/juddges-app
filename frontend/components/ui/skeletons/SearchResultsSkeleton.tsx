import { SkeletonCard } from './SkeletonCard';

interface SearchResultsSkeletonProps {
  /**
   * Number of skeleton cards to display
   * @default 5
   */
  count?: number;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SearchResultsSkeleton - Search results loading skeleton
 *
 * Displays multiple card skeletons representing search results.
 * Used on search pages while results are being fetched.
 *
 * @example
 * ```tsx
 * <SearchResultsSkeleton />
 * <SearchResultsSkeleton count={10} />
 * ```
 */
export function SearchResultsSkeleton({
  count = 5,
  className
}: SearchResultsSkeletonProps) {
  return (
    <div className={className} role="status" aria-label="Loading search results">
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} contentLines={3} />
        ))}
      </div>
      <span className="sr-only">Loading search results...</span>
    </div>
  );
}

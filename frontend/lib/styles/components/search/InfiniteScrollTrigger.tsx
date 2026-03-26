'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader2 } from 'lucide-react';

interface InfiniteScrollTriggerProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  className?: string;
}

/**
 * Infinite scroll trigger component that detects when scrolled into view
 * and triggers loading of more results.
 *
 * OPTIMIZED: Uses refs to prevent multiple loadMore calls when callbacks change
 */
export function InfiniteScrollTrigger({
  onLoadMore,
  hasMore,
  isLoading,
  className,
}: InfiniteScrollTriggerProps): React.JSX.Element | null {
  // Use refs to prevent stale closure issues and multiple calls
  const isLoadingRef = useRef(isLoading);
  const hasMoreRef = useRef(hasMore);
  const onLoadMoreRef = useRef(onLoadMore);
  const loadingInProgressRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    isLoadingRef.current = isLoading;
    hasMoreRef.current = hasMore;
    onLoadMoreRef.current = onLoadMore;
  }, [isLoading, hasMore, onLoadMore]);

  // Reset loading flag when isLoading changes to false
  useEffect(() => {
    if (!isLoading) {
      loadingInProgressRef.current = false;
    }
  }, [isLoading]);

  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '100px', // Trigger slightly before visible for smoother UX
  });

  // Stable callback that uses refs
  const handleLoadMore = useCallback(() => {
    // Guard against multiple simultaneous calls
    if (loadingInProgressRef.current || isLoadingRef.current || !hasMoreRef.current) {
      return;
    }
    loadingInProgressRef.current = true;
    onLoadMoreRef.current();
  }, []);

  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      handleLoadMore();
    }
  }, [inView, hasMore, isLoading, handleLoadMore]);

  // Don't render anything if no more results to load
  if (!hasMore && !isLoading) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`h-16 flex items-center justify-center ${className || ''}`}
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading more documents...</span>
        </div>
      )}
      {!isLoading && hasMore && (
        <span className="text-sm text-muted-foreground">
          Scroll down to load more
        </span>
      )}
    </div>
  );
}

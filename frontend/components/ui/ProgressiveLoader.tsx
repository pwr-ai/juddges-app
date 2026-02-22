"use client";

import { useState, useEffect, ReactNode } from 'react';

interface ProgressiveLoaderProps {
  /**
   * Whether content is currently loading
   */
  isLoading: boolean;

  /**
   * The actual content to display when loaded
   */
  children: ReactNode;

  /**
   * Skeleton component to show during loading
   */
  skeleton: ReactNode;

  /**
   * Delay before showing skeleton (prevents flash for fast loads)
   * @default 200
   */
  delay?: number;

  /**
   * Minimum loading time to prevent jarring flashes
   * @default 0
   */
  minLoadingTime?: number;
}

/**
 * ProgressiveLoader - Smart loading state manager
 *
 * Prevents loading state "flashing" for fast operations by introducing
 * a small delay before showing skeleton, and optionally enforcing a
 * minimum loading time.
 *
 * Best Practices:
 * - Use 200ms delay for most cases (user won't notice for fast loads)
 * - Use 500ms minLoadingTime for operations that feel "too fast"
 * - Always provide a skeleton that matches your content structure
 *
 * @example
 * ```tsx
 * <ProgressiveLoader
 *   isLoading={isLoading}
 *   skeleton={<SearchResultsSkeleton />}
 * >
 *   <SearchResults data={data} />
 * </ProgressiveLoader>
 * ```
 */
export function ProgressiveLoader({
  isLoading,
  children,
  skeleton,
  delay = 200,
  minLoadingTime = 0
}: ProgressiveLoaderProps) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [canShowContent, setCanShowContent] = useState(true);

  useEffect(() => {
    if (isLoading) {
      // Track when loading started
      setLoadingStartTime(Date.now());
      setCanShowContent(false);

      // Show skeleton after delay
      const timer = setTimeout(() => setShowSkeleton(true), delay);
      return () => clearTimeout(timer);
    } else {
      // Loading finished
      if (loadingStartTime && minLoadingTime > 0) {
        const elapsedTime = Date.now() - loadingStartTime;
        const remainingTime = minLoadingTime - elapsedTime;

        if (remainingTime > 0) {
          // Enforce minimum loading time
          setTimeout(() => {
            setShowSkeleton(false);
            setCanShowContent(true);
            setLoadingStartTime(null);
          }, remainingTime);
        } else {
          // Already exceeded minimum time
          setShowSkeleton(false);
          setCanShowContent(true);
          setLoadingStartTime(null);
        }
      } else {
        // No minimum loading time
        setShowSkeleton(false);
        setCanShowContent(true);
        setLoadingStartTime(null);
      }
    }
  }, [isLoading, delay, minLoadingTime, loadingStartTime]);

  // Still loading and should show skeleton
  if (isLoading && showSkeleton) {
    return <>{skeleton}</>;
  }

  // Loading but delay hasn't passed yet - show nothing to prevent flash
  if (isLoading && !showSkeleton) {
    return null;
  }

  // Finished loading but enforcing minimum time
  if (!isLoading && !canShowContent) {
    return <>{skeleton}</>;
  }

  // Show actual content
  return <>{children}</>;
}

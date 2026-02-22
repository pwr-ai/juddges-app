import { Search } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface EmptySearchResultsProps {
  /**
   * Callback to reset/clear filters
   */
  onReset?: () => void;

  /**
   * Custom message override
   */
  message?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptySearchResults - Empty state for search pages
 *
 * Displayed when a search query returns no results.
 * Provides helpful actions to adjust search criteria.
 *
 * @example
 * ```tsx
 * <EmptySearchResults onReset={handleClearFilters} />
 * ```
 */
export function EmptySearchResults({
  onReset,
  message,
  className
}: EmptySearchResultsProps) {
  return (
    <EmptyState
      icon={Search}
      title="No judgments found"
      description={
        message ||
        "We couldn't find any judgments matching your search criteria. Try adjusting your filters or search terms."
      }
      action={
        onReset
          ? {
              label: "Clear filters",
              onClick: onReset,
              variant: 'default'
            }
          : undefined
      }
      secondaryAction={{
        label: "View all judgments",
        onClick: () => {
          window.location.href = '/search';
        },
        variant: 'outline'
      }}
      className={className}
    />
  );
}

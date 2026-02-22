import { Bookmark } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface EmptySavedItemsProps {
  /**
   * Callback to browse judgments
   */
  onBrowse?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptySavedItems - Empty state for saved/bookmarked items
 *
 * Displayed when a user has no saved judgments.
 * Encourages them to explore and bookmark items.
 *
 * @example
 * ```tsx
 * <EmptySavedItems onBrowse={() => router.push('/search')} />
 * ```
 */
export function EmptySavedItems({ onBrowse, className }: EmptySavedItemsProps) {
  return (
    <EmptyState
      icon={Bookmark}
      title="No saved items"
      description="You haven't saved any judgments yet. Browse our database and save items you want to reference later."
      action={
        onBrowse
          ? {
              label: "Browse judgments",
              onClick: onBrowse,
              variant: 'default'
            }
          : {
              label: "Go to search",
              onClick: () => {
                window.location.href = '/search';
              },
              variant: 'default'
            }
      }
      className={className}
    />
  );
}

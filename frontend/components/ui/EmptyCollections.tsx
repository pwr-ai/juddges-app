import { FolderPlus } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface EmptyCollectionsProps {
  /**
   * Callback to open create collection dialog
   */
  onCreate: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EmptyCollections - Empty state for collections page
 *
 * Displayed when a user has no collections yet.
 * Encourages them to create their first collection.
 *
 * @example
 * ```tsx
 * <EmptyCollections onCreate={() => setCreateDialogOpen(true)} />
 * ```
 */
export function EmptyCollections({ onCreate, className }: EmptyCollectionsProps) {
  return (
    <EmptyState
      icon={FolderPlus}
      title="No collections yet"
      description="Collections help you organize and save judgments for easy reference. Create your first collection to get started."
      action={{
        label: "Create collection",
        onClick: onCreate,
        variant: 'default'
      }}
      className={className}
    />
  );
}

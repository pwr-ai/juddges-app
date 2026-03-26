import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { IconButton } from './icon-button';
import { cn } from '@/lib/utils';

export interface ItemEditingButtonsProps {
  /** Handler for edit action */
  onEdit: () => void;
  /** Handler for delete action */
  onDelete: () => void;
  /** Optional className for the container */
  className?: string;
  /** Optional aria label prefix (default: "item") */
  itemLabel?: string;
}

/**
 * ItemEditingButtons Component
 *
 * A reusable component that displays edit and delete buttons with consistent styling.
 * Used for editing and deleting items throughout the application.
 *
 * @example
 * ```tsx
 * <ItemEditingButtons
 *   onEdit={() => handleEdit()}
 *   onDelete={() => handleDelete()}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <ItemEditingButtons
 *   onEdit={() => handleEdit()}
 *   onDelete={() => handleDelete()}
 *   itemLabel="collection"
 * />
 * ```
 */
export function ItemEditingButtons({
  onEdit,
  onDelete,
  className,
  itemLabel = "item",
}: ItemEditingButtonsProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      <IconButton
        icon={Pencil}
        onClick={onEdit}
        variant="muted"
        size="lg"
        compact={true}
        hoverStyle="color"
        iconHover="rotate"
        aria-label={`Edit ${itemLabel}`}
      />
      <IconButton
        icon={Trash2}
        onClick={onDelete}
        variant="error"
        size="lg"
        compact={true}
        hoverStyle="color"
        iconHover="scale"
        aria-label={`Delete ${itemLabel}`}
      />
    </div>
  );
}

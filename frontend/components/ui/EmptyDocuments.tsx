import { FileText } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface EmptyDocumentsProps {
  /**
   * Callback to open upload dialog
   */
  onUpload?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Custom title override
   */
  title?: string;

  /**
   * Custom description override
   */
  description?: string;
}

/**
 * EmptyDocuments - Empty state for document lists
 *
 * Displayed when there are no documents to show.
 * Can be used on various document listing pages.
 *
 * @example
 * ```tsx
 * <EmptyDocuments onUpload={() => setUploadDialogOpen(true)} />
 * ```
 */
export function EmptyDocuments({
  onUpload,
  className,
  title = "No documents found",
  description = "There are no documents to display. Upload or create your first document to get started."
}: EmptyDocumentsProps) {
  return (
    <EmptyState
      icon={FileText}
      title={title}
      description={description}
      action={
        onUpload
          ? {
              label: "Upload document",
              onClick: onUpload,
              variant: 'default'
            }
          : undefined
      }
      className={className}
    />
  );
}

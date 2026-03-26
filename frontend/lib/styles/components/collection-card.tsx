/**
 * Collection Card Component
 * Reusable card component for displaying collection items
 * Used in collections list page
 */

"use client";

import React from 'react';
import { LucideIcon, FolderOpen, FileText } from 'lucide-react';
import { BaseCard } from './base-card';
import { IconButton } from './icon-button';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props for CollectionCard component
 */
export interface CollectionCardProps {
  /** Collection name */
  name: string;
  /** Number of documents in the collection */
  documentCount: number;
  /** Optional collection description */
  description?: string;
  /** Optional icon (defaults to FolderOpen) */
  icon?: LucideIcon;
  /** Click handler for the card */
  onClick?: () => void;
  /** Delete handler */
  onDelete?: (e: React.MouseEvent) => void;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Collection Card Component
 *
 * A reusable card component for displaying collections with name, document count,
 * and delete action. Uses BaseCard with light variant for consistent styling.
 *
 * @example
 * ```tsx
 * <CollectionCard
 *   name="Tax Fraud Cases 2024"
 *   documentCount={15}
 *   onClick={() => router.push(`/collections/${id}`)}
 *   onDelete={(e) => {
 *     e.stopPropagation();
 *     handleDelete(id);
 *   }}
 * />
 * ```
 */
export function CollectionCard({
  name,
  documentCount,
  description,
  icon: Icon = FolderOpen,
  onClick,
  onDelete,
  className,
}: CollectionCardProps): React.JSX.Element {
  return (
    <BaseCard
      onClick={onClick}
      variant="light"
      className={cn("rounded-2xl", className)}
      clickable={!!onClick}
    >
      <div className="flex justify-between items-start gap-4 -m-1.5 p-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/10 group-hover:from-primary/20 group-hover:to-primary/10 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
            <Icon className="h-6 w-6 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
              {name}
            </h2>
            {description && (
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                {description}
              </p>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span className="font-medium">{documentCount}</span>
              <span>{documentCount === 1 ? 'document' : 'documents'}</span>
            </div>
          </div>
        </div>

        {/* Delete Button */}
        {onDelete && (
          <IconButton
            icon={Trash2}
            onClick={(e) => {
              e?.stopPropagation();
              if (e) {
                onDelete(e);
              }
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive shrink-0"
            size="lg"
            variant="error"
            aria-label="Delete collection"
          />
        )}
      </div>
    </BaseCard>
  );
}

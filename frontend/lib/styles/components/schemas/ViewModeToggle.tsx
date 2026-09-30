/**
 * View Mode Toggle Component
 * Liquid glass pill design for switching between list and grid views
 * Matches EditorialTabs styling
 */

"use client";

import React from 'react';
import { List as ListIcon, Grid3x3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ViewModeToggleProps {
 /** Current view mode */
 viewMode: 'list' | 'grid';
 /** Callback when view mode changes */
 onViewModeChange: (mode: 'list' | 'grid') => void;
 /** Optional className for additional styling */
 className?: string;
}

/**
 * View Mode Toggle Component
 *
 * A liquid glass pill toggle for switching between list and grid views.
 * Uses the same styling as EditorialTabs for consistency.
 */
export function ViewModeToggle({
  viewMode,
  onViewModeChange,
  className,
}: ViewModeToggleProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "inline-flex h-10 w-fit items-center justify-center border border-rule bg-parchment-deep/40 p-1 gap-1",
        className
      )}
    >
      {/* Grid Button */}
      <button
        type="button"
        onClick={() => onViewModeChange('grid')}
        className={cn(
          "relative inline-flex h-full flex-1 items-center justify-center",
          "px-3 py-1.5 text-sm",
          "whitespace-nowrap",
          "transition-colors duration-150 ease-out",
          "z-10",
          viewMode === 'grid'
            ? "text-ink font-semibold"
            : "text-ink-soft hover:text-ink",
          "focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        aria-label="Grid view"
      >
        {viewMode === 'grid' && (
          <motion.div
            layoutId="view-mode-indicator"
            className="absolute inset-0 bg-parchment border border-rule/80 shadow-sm -z-10"
            transition={{
              type: "spring",
              bounce: 0.15,
              duration: 0.35,
            }}
          />
        )}
        <Grid3x3 className="h-4 w-4 relative z-10" />
      </button>

      {/* List Button */}
      <button
        type="button"
        onClick={() => onViewModeChange('list')}
        className={cn(
          "relative inline-flex h-full flex-1 items-center justify-center",
          "px-3 py-1.5 text-sm",
          "whitespace-nowrap",
          "transition-colors duration-150 ease-out",
          "z-10",
          viewMode === 'list'
            ? "text-ink font-semibold"
            : "text-ink-soft hover:text-ink",
          "focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        aria-label="List view"
      >
        {viewMode === 'list' && (
          <motion.div
            layoutId="view-mode-indicator"
            className="absolute inset-0 bg-parchment border border-rule/80 shadow-sm -z-10"
            transition={{
              type: "spring",
              bounce: 0.15,
              duration: 0.35,
            }}
          />
        )}
        <ListIcon className="h-4 w-4 relative z-10" />
      </button>
    </div>
  );
}

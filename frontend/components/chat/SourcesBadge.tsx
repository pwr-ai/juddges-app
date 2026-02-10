// components/chat/SourcesBadge.tsx

import React from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourcesBadgeProps {
  count: number;
  isExpanded: boolean;
  onClick: () => void;
  isLoading?: boolean;
}

export function SourcesBadge({ count, isExpanded, onClick, isLoading }: SourcesBadgeProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center justify-center gap-2.5 whitespace-nowrap h-9 text-sm font-medium rounded-xl px-4 overflow-hidden",
        "bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-blue-50/80 dark:from-blue-950/50 dark:via-indigo-950/40 dark:to-blue-950/50",
        "border border-blue-200/80 dark:border-blue-800/60",
        "shadow-md hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5",
        "transition-all duration-300",
        "text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200",
        "hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-100/80 dark:hover:bg-blue-900/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      {/* Gradient overlay - always visible */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-100/60 via-indigo-100/40 to-blue-100/60 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-blue-900/40 opacity-60 group-hover:opacity-100 transition-opacity duration-300 rounded-xl -z-10" />
      
      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        <BookOpen className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold">
          {count} {count === 1 ? 'source' : 'sources'} cited
        </span>
        {isLoading ? (
          <div className="h-3.5 w-3.5 border-2 border-blue-300 dark:border-blue-600 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin shrink-0" />
        ) : isExpanded ? (
          <ChevronUp className="h-4 w-4 transition-transform duration-200 shrink-0 group-hover:scale-110 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronDown className="h-4 w-4 transition-transform duration-200 shrink-0 group-hover:scale-110 text-blue-600 dark:text-blue-400" />
        )}
      </span>
    </button>
  );
}

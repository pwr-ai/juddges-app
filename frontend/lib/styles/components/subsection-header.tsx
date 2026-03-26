/**
 * Subsection Header Component
 * Reusable h4 header component for small subsection headers
 * Used for headers within cards, tips, or nested sections
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface SubsectionHeaderProps {
  /**
   * Header text
   */
  title: string;
  /**
   * Optional className for the container
   */
  className?: string;
  /**
   * Optional className for the h4 element
   */
  headerClassName?: string;
  /**
   * HTML element to use (defaults to h4)
   */
  as?: 'h4' | 'h5' | 'h6';
}

/**
 * Subsection Header Component
 * Small header component for subsections
 *
 * @example
 * <SubsectionHeader title="From Search or Chat" />
 *
 * @example
 * <SubsectionHeader
 *   title="Manual Entry"
 *   className="mb-2"
 * />
 */
export function SubsectionHeader({
  title,
  className,
  headerClassName,
  as: Component = 'h4',
}: SubsectionHeaderProps): React.JSX.Element {
  return (
    <Component
      className={cn(
        "subsection-header", // Added for print styling
        "font-bold text-foreground pb-1 overflow-visible text-sm",
        className,
        headerClassName
      )}
    >
      {title}
    </Component>
  );
}

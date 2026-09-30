/**
 * Document Field Card Component
 * A modern card component specifically designed for text-rich document fields
 * Features subtle elevation, modern spacing, and excellent readability
 * Optimized for legal/document contexts with contemporary 2024/2025 design
 */

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

export interface DocumentFieldCardProps {
 /**
 * Optional title to display at the top of the card
 * Can be a string or React element for custom title layouts
 */
 title?: string | React.ReactNode;
 /**
 * Optional className for the card
 */
 className?: string;
 /**
 * Optional children to render inside the card
 */
 children?: React.ReactNode;
 /**
 * Padding size
 * @default"md"
 */
 padding?: 'sm' | 'md' | 'lg';
 /**
 * Whether to show a subtle border
 * @default true
 */
 showBorder?: boolean;
 /**
 * Optional onClick handler - makes the card interactive
 */
 onClick?: () => void;
}

const paddingClasses = {
 sm: 'p-4',
 md: 'p-5',
 lg: 'p-6',
} as const;

/**
 * Document Field Card Component
 *
 * A modern card component designed for document field rendering.
 * Features subtle elevation with soft shadows, modern spacing, and clean aesthetics.
 * Optimized for readability while maintaining contemporary design standards.
 *
 * @example
 * <DocumentFieldCard title="Field Name">
 * <div>Field value content</div>
 * </DocumentFieldCard>
 *
 * @example
 * <DocumentFieldCard padding="lg"showBorder>
 * <p>Long text content</p>
 * </DocumentFieldCard>
 */
export const DocumentFieldCard = memo(function DocumentFieldCard({
 title,
 className,
 children,
 padding = 'md',
 showBorder = true,
 onClick,
}: DocumentFieldCardProps) {
 const isClickable = !!onClick;

 return (
 <div
 onClick={onClick}
 role={isClickable ? "button": undefined}
 tabIndex={isClickable ? 0 : undefined}
 onKeyDown={isClickable ? (e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onClick?.();
 }
 } : undefined}
      className={cn(
        // Base container
        "bg-parchment",
        // Border
        showBorder && "border border-rule",
        // Rounded corners
        "rounded-none",
        // Shadow
        "shadow-none",
        // Padding
        paddingClasses[padding],
        // Transitions
        "transition-colors duration-150",
        // Interactive states (only if clickable)
        isClickable && [
          "cursor-pointer",
          "hover:bg-parchment-deep",
          "hover:border-ink",
        ],
        // Focus state for accessibility
        isClickable && "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
        className
      )}
    >
      {/* Content */}
      <div className="flex flex-col h-full relative">
        {title && (
          typeof title === 'string' ? (
            <h3 className="text-sm font-medium text-ink mb-3 leading-tight">
              {title}
            </h3>
          ) : (
            <div className="text-sm font-medium text-ink mb-3 leading-tight">
              {title}
            </div>
          )
        )}
        <div className="text-ink text-sm">
          {children}
        </div>
      </div>
    </div>
 );
});

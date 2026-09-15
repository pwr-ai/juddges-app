/**
 * Light Card Component
 * A lightweight card with a subtle, muted background following Editorial Jurisprudence styling.
 * Features a sharp paper surface for panels, sections, and auxiliary content.
 */

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

export interface LightCardProps {
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
   * @default "md"
   */
  padding?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show a subtle border
   * @default true
   */
  showBorder?: boolean;
  /**
   * Whether to show a subtle shadow
   * @default false
   */
  showShadow?: boolean;
  /**
   * Optional onClick handler - makes the card interactive
   */
  onClick?: () => void;
}

const paddingClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-6',
};

export const LightCard = memo(function LightCard({
  title,
  className,
  children,
  padding = 'md',
  showBorder = true,
  showShadow = false,
  onClick,
}: LightCardProps) {
  const isClickable = !!onClick;
  const cleanClassName = className
    ?.replace(/rounded-[\w[\]]+/g, '')
    .replace(/bg-\S+/g, '')
    .trim() || '';

  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
      className={cn(
        "relative overflow-hidden rounded-none bg-card transition-colors",
        showBorder && "border border-rule",
        showShadow && "shadow-xs",
        isClickable && "cursor-pointer hover:bg-parchment-deep hover:-translate-y-px transition-[background-color,transform] duration-180",
        isClickable && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        paddingClasses[padding],
        cleanClassName
      )}
    >
      {title && (
        typeof title === 'string' ? (
          <h3 className="font-serif font-medium text-sm mb-3 text-ink">
            {title}
          </h3>
        ) : (
          <div className="font-serif font-medium text-sm mb-3 text-ink">
            {title}
          </div>
        )
      )}
      {children}
    </div>
  );
});

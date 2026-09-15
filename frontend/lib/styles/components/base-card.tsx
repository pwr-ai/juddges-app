/**
 * Base Card Component
 * General-purpose card component for displaying content, examples, or clickable items
 * Supports icon, description, and click handler
 * Thin wrapper over EditorialCard following Editorial Jurisprudence design system.
 */

import React, { memo } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorialCard } from '@/components/editorial/EditorialCard';
import { Skeleton } from '@/components/ui/skeleton';

export interface BaseCardProps {
  /**
   * Description or content text
   */
  description?: string;
  /**
   * Optional title to display above the description
   */
  title?: string | React.ReactNode;
  /**
   * Optional icon to display in the card
   */
  icon?: LucideIcon;
  /**
   * Click handler function
   */
  onClick?: () => void;
  /**
   * Optional className for the card
   */
  className?: string;
  /**
   * Optional inline styles for the card
   */
  style?: React.CSSProperties;
  /**
   * Whether the card is clickable
   * @default true
   */
  clickable?: boolean;
  /**
   * Optional children to render instead of description
   */
  children?: React.ReactNode;
  /**
   * Whether to show skeleton loading state
   * @default false
   */
  skeleton?: boolean;
  /**
   * Visual variant of the card (kept for API compatibility)
   * @default "default"
   */
  variant?: 'default' | 'light';
  /**
   * Whether to use vibrant gradient for light variant (kept for API compatibility)
   * @default false
   */
  highlighted?: boolean;
}

export const BaseCard = memo(function BaseCard({
  description,
  title,
  icon: Icon,
  onClick,
  className,
  style,
  clickable,
  children,
  skeleton = false,
  variant: _variant = 'default',
  highlighted: _highlighted = false,
}: BaseCardProps) {
  const isClickable = clickable !== undefined ? clickable : !!onClick;
  // Strip legacy rounded and bg- classes so caller overrides don't re-introduce glass or non-editorial radii
  const cleanClassName = className
    ?.replace(/rounded-[\w[\]]+/g, '')
    .replace(/bg-\S+/g, '')
    .trim() || '';

  return (
    <EditorialCard
      clickable={isClickable}
      onClick={onClick}
      style={style}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable && onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      className={cn("rounded-none border border-rule", cleanClassName)}
    >
      {skeleton ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-8 w-8 shrink-0" />
        </div>
      ) : (
        <>
          {(title || Icon) && (
            <div
              className={cn(
                "flex items-center gap-2 mb-3",
                typeof title !== 'string' && "justify-between w-full"
              )}
            >
              {Icon && <Icon className="h-4 w-4 text-ink shrink-0" />}
              {typeof title === 'string' ? (
                <h3 className="font-serif font-medium text-base leading-tight text-ink">
                  {title}
                </h3>
              ) : (
                <div className="flex-1 w-full">{title}</div>
              )}
            </div>
          )}
          {children ? (
            children
          ) : description ? (
            <p className="text-sm leading-relaxed text-ink-soft">
              {description}
            </p>
          ) : null}
        </>
      )}
    </EditorialCard>
  );
});

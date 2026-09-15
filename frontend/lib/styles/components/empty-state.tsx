/**
 * Empty State Component
 * Reusable component for displaying empty states (no results, no data, etc.)
 * Used for search results, lists, and other empty states
 */

"use client";

import React from 'react';
import { SearchX, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VariantButton } from './variant-button';
import type { VariantButtonProps } from './variant-button';

type PrimaryButtonProps = Omit<
  Extract<VariantButtonProps, { intent: "primary" }>,
  "intent"
>;

type SecondaryButtonProps = Omit<
  Extract<VariantButtonProps, { intent: "secondary" }>,
  "intent"
>;

/**
 * Props for EmptyState component
 */
export interface EmptyStateProps {
 /** Icon to display (defaults to SearchX) */
 icon?: LucideIcon;
 /** Title text */
 title: string;
 /** Description text */
 description?: string;
 /** Optional query/search term to display in a badge */
 query?: string;
 /** Optional tip/info card content */
 tip?: React.ReactNode;
 /** Position of the tip content - 'above' or 'below' the main content (default: 'above') */
 tipPosition?: 'above' | 'below';
 /** Primary action button */
 primaryAction?: {
 label: string;
 onClick: () => void;
 icon?: LucideIcon;
 } & Omit<PrimaryButtonProps, 'children' | 'onClick' | 'icon'>;
 /** Secondary action button */
 secondaryAction?: {
 label: string;
 onClick: () => void;
 icon?: LucideIcon;
 } & Omit<SecondaryButtonProps, 'children' | 'onClick' | 'icon'>;
 /** Additional action buttons */
 actions?: React.ReactNode;
 /** Optional className for the container */
 className?: string;
 /** Variant type */
 variant?: 'search' | 'default';
}

/**
 * Empty State Component
 *
 * A reusable component for displaying empty states with icon, title, description,
 * optional query badge, tip card, and action buttons.
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No results found"
 * description="We couldn't find any documents matching your search query"
 * query="Swiss franc loans"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No results found"
 * description="Try adjusting your search"
 * primaryAction={{
 * label: "Switch to Thinking Mode",
 * onClick: () => handleSwitch(),
 * icon: Brain
 * }}
 * secondaryAction={{
 * label: "Back",
 * onClick: () => handleBack(),
 * icon: ArrowLeft
 * }}
 * />
 * ```
 *
 * @example
 * ```tsx
 * <EmptyState
 * title="No Collections Yet"
 * description="Create your first collection"
 * tipPosition="below"
 * tip={<div>Helpful tips displayed below the main content</div>}
 * />
 * ```
 */
export function EmptyState({
 icon: Icon = SearchX,
 title,
 description,
 query,
 tip,
 tipPosition = 'above',
 primaryAction,
 secondaryAction,
 actions,
 className,
 variant = 'default',
}: EmptyStateProps): React.JSX.Element {
  const renderTip = (): React.JSX.Element | null => {
    if (!tip) return null;

    return (
      <div className={cn(
        "w-full text-center",
        tipPosition === 'above' ? "mb-5" : "mt-6"
      )}>
        {typeof tip === 'string' ? (
          <div className="inline-flex items-start gap-2 px-4 py-3 bg-parchment-deep border border-rule text-left">
            <p className="text-sm text-ink-soft leading-relaxed">
              {tip}
            </p>
          </div>
        ) : (
          tip
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "pt-4 pb-8 px-6",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center w-full max-w-md">
        {/* Tip card - above content */}
        {tipPosition === 'above' && renderTip()}

        {/* 16px ink icon in sharp card container */}
        <div className="mb-4 flex items-center justify-center w-10 h-10 border border-rule bg-card">
          <Icon className="h-4 w-4 text-ink" />
        </div>

        {/* Headline */}
        <h3 className="font-serif font-medium text-lg sm:text-xl text-ink mb-2 text-center">
          {title}
        </h3>

        {/* Description and query badge */}
        {(description || query) && (
          <div className="text-center mb-4 space-y-2">
            {description && (
              <p className="text-sm text-ink-soft leading-relaxed">
                {description}
              </p>
            )}
            {query && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-parchment-deep border border-rule text-xs font-mono text-ink">
                <span>&quot;{query}&quot;</span>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {(primaryAction || secondaryAction || actions) && (
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            {secondaryAction && (
              <VariantButton
                intent="secondary"
                onClick={secondaryAction.onClick}
                icon={secondaryAction.icon}
                size={secondaryAction.size || "md"}
                disabled={secondaryAction.disabled}
                className={secondaryAction.className}
              >
                {secondaryAction.label}
              </VariantButton>
            )}
            {primaryAction && (
              <VariantButton
                intent="primary"
                onClick={primaryAction.onClick}
                icon={primaryAction.icon}
                size={primaryAction.size || "md"}
                disabled={primaryAction.disabled}
                className={primaryAction.className}
              >
                {primaryAction.label}
              </VariantButton>
            )}
            {actions}
          </div>
        )}

        {/* Tip card - below content */}
        {tipPosition === 'below' && renderTip()}
      </div>
    </div>
  );
}

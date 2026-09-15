/**
 * Error Card Component
 * Reusable error display component following Editorial Jurisprudence styling.
 * Uses EditorialCard with oxblood authority border to clearly indicate error state.
 */

import React, { memo } from 'react';
import { VariantButton } from './variant-button';
import { RefreshCw, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorialCard } from '@/components/editorial/EditorialCard';

export interface ErrorCardProps {
  /**
   * Error title/heading
   */
  title?: string;
  /**
   * Error message or description
   */
  message: string;
  /**
   * Optional retry action handler
   */
  onRetry?: () => void;
  /**
   * Retry button label
   * @default "Retry"
   */
  retryLabel?: string;
  /**
   * Whether to show the retry button
   * @default true
   */
  showRetry?: boolean;
  /**
   * Optional dismiss action handler
   */
  onDismiss?: () => void;
  /**
   * Dismiss button label
   * @default "Dismiss"
   */
  dismissLabel?: string;
  /**
   * Whether to show dismiss button in header
   * @default false
   */
  showDismissIcon?: boolean;
  /**
   * Optional secondary action button
   */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
  /**
   * Optional className for the card
   */
  className?: string;
  /**
   * Optional children to render additional content
   */
  children?: React.ReactNode;
  /**
   * Color variant for the error card gradient (kept for API compatibility)
   * @default "red-rose"
   */
  variant?: 'red-rose' | 'red-blue';
}

export const ErrorCard = memo(function ErrorCard({
  title = 'Error',
  message,
  onRetry,
  retryLabel = 'Retry',
  showRetry = true,
  onDismiss,
  dismissLabel = 'Dismiss',
  showDismissIcon = false,
  secondaryAction,
  className,
  children,
  variant: _variant = 'red-rose',
}: ErrorCardProps) {
  const cleanClassName = className
    ?.replace(/rounded-[\w[\]]+/g, '')
    .replace(/bg-\S+/g, '')
    .trim() || '';

  return (
    <EditorialCard
      flat
      className={cn(
        "rounded-none border border-rule border-l-2 border-l-oxblood bg-card",
        cleanClassName
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <AlertCircle className="h-5 w-5 text-oxblood" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {title && (
            <h3 className="font-serif font-medium text-base text-ink leading-tight">
              {title}
            </h3>
          )}
          <p className="text-sm leading-relaxed text-ink-soft">
            {message}
          </p>
        </div>

        {showDismissIcon && onDismiss && (
          <VariantButton
            intent="icon"
            icon={X}
            onClick={onDismiss}
            variant="error"
            aria-label="Dismiss error"
          />
        )}
      </div>

      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}

      {(showRetry && onRetry) || secondaryAction || (onDismiss && !showDismissIcon) ? (
        <div className="flex items-center gap-3 justify-start mt-4 pt-3 border-t border-rule">
          {showRetry && onRetry && (
            <VariantButton
              intent="primary"
              onClick={onRetry}
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              {retryLabel}
            </VariantButton>
          )}
          {secondaryAction && (
            <VariantButton
              intent="secondary"
              onClick={secondaryAction.onClick}
              icon={secondaryAction.icon}
              size="sm"
            >
              {secondaryAction.label}
            </VariantButton>
          )}
          {onDismiss && !showDismissIcon && (
            <VariantButton
              intent="secondary"
              onClick={onDismiss}
              size="sm"
            >
              {dismissLabel}
            </VariantButton>
          )}
        </div>
      ) : null}
    </EditorialCard>
  );
});

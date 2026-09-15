/**
 * Styled Badge Component
 * Wraps base UI badge component with design system styling
 * Used for labels, tags, and status indicators
 */

"use client";

import React from 'react';
import { Badge as BaseBadge, badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';

/**
 * Props for Badge component
 */
export interface BadgeProps extends React.ComponentProps<typeof BaseBadge> {
 /** Badge variant */
 variant?: VariantProps<typeof badgeVariants>['variant'];
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Styled Badge Component
 *
 * A styled badge component that follows the design system patterns.
 * Supports outline and secondary variants with backdrop blur and gradients.
 *
 * @example
 * ```tsx
 * <Badge variant="outline"className="flex items-center gap-1.5">
 * <Icon className="h-3 w-3"/>
 * Label
 * </Badge>
 * ```
 *
 * @example
 * ```tsx
 * <Badge variant="secondary" className="bg-parchment-deep">
 *   Keyword
 * </Badge>
 * ```
 */
export function Badge({
  variant = "outline",
  className,
  ...props
}: BadgeProps): React.JSX.Element {
  // Use BaseBadge directly without extra wrapper to avoid duplication
  return (
    <BaseBadge
      variant={variant}
      className={cn(
        "transition-colors",
        variant === "outline" && cn(
          "border-rule text-ink",
          "hover:bg-parchment-deep"
        ),
        variant === "secondary" && cn(
          "bg-parchment-deep text-ink",
          "border-rule",
          "hover:bg-rule/40"
        ),
        className
      )}
      {...props}
    />
  );
}

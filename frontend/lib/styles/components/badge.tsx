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
 * <Badge variant="secondary"className="bg-slate-100/60">
 * Keyword
 * </Badge>
 * ```
 */
export function Badge({
 variant ="outline",
 className,
 ...props
}: BadgeProps): React.JSX.Element {
 // Use BaseBadge directly without extra wrapper to avoid duplication
 return (
 <BaseBadge
 variant={variant}
 className={cn(
 // Design system base styles
"transition-all duration-300",
 // Outline variant enhancements
 variant === "outline"&& cn(
"border-slate-200/50",
"hover:bg-slate-200/50",
"backdrop-blur-sm"
 ),
 // Secondary variant enhancements
 variant === "secondary"&& cn(
"bg-slate-200/60",
"border-slate-200/30",
"backdrop-blur-sm",
"hover:bg-slate-200/60",
"hover:scale-105"
 ),
 className
 )}
 {...props}
 />
 );
}

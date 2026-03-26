/**
 * Styled Collapsible Components
 * Wraps base UI collapsible components with design system styling
 * Used for expandable/collapsible content sections
 */

"use client";

import React from 'react';
import {
 Collapsible as BaseCollapsible,
 CollapsibleTrigger as BaseCollapsibleTrigger,
 CollapsibleContent as BaseCollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * Props for Collapsible component
 */
export interface CollapsibleProps extends React.ComponentProps<typeof BaseCollapsible> {
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Styled Collapsible Component
 *
 * A styled collapsible container that follows the design system patterns.
 * Supports gradient backgrounds and transitions matching the design system.
 *
 * @example
 * ```tsx
 * <Collapsible
 * open={isExpanded}
 * onOpenChange={setIsExpanded}
 * className="border rounded-xl"
 * >
 * <CollapsibleTrigger>Toggle</CollapsibleTrigger>
 * <CollapsibleContent>Content</CollapsibleContent>
 * </Collapsible>
 * ```
 */
export function Collapsible({
 className,
 ...props
}: CollapsibleProps): React.JSX.Element {
 return (
 <BaseCollapsible
 className={cn(
 // Design system base styles
"border rounded-xl",
"bg-gradient-to-br from-blue-50/60 via-indigo-50/30 to-purple-50/20",
"",
"backdrop-blur-sm",
"border-blue-200/50",
"shadow-sm",
"transition-all duration-300",
 className
 )}
 {...props}
 />
 );
}

/**
 * Props for CollapsibleTrigger component
 */
export interface CollapsibleTriggerProps extends React.ComponentProps<typeof BaseCollapsibleTrigger> {
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Styled Collapsible Trigger Component
 *
 * A styled collapsible trigger with design system hover effects.
 *
 * @example
 * ```tsx
 * <CollapsibleTrigger className="w-full p-4">
 * <span>Click to expand</span>
 * </CollapsibleTrigger>
 * ```
 */
export function CollapsibleTrigger({
 className,
 ...props
}: CollapsibleTriggerProps): React.JSX.Element {
 return (
 <BaseCollapsibleTrigger
 className={cn(
 // Design system hover effects
"flex items-center justify-between w-full",
"hover:bg-gradient-to-br hover:from-blue-100/60 hover:via-indigo-100/40 hover:to-purple-100/30",
"",
"transition-all duration-300 rounded-xl",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 className
 )}
 {...props}
 />
 );
}

/**
 * Props for CollapsibleContent component
 */
export interface CollapsibleContentProps extends React.ComponentProps<typeof BaseCollapsibleContent> {
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Styled Collapsible Content Component
 *
 * A styled collapsible content area with consistent padding and spacing.
 *
 * @example
 * ```tsx
 * <CollapsibleContent className="px-3 pb-3">
 * <p>Content here</p>
 * </CollapsibleContent>
 * ```
 */
export function CollapsibleContent({
 className,
 ...props
}: CollapsibleContentProps): React.JSX.Element {
 return (
 <BaseCollapsibleContent
 className={cn(
 // Base content styling with animation support
"data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
"overflow-hidden",
 className
 )}
 {...props}
 />
 );
}

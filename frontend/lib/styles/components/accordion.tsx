/**
 * Styled Accordion Components
 * Wraps base UI accordion components with design system styling
 * Used for expandable/collapsible content sections
 */

"use client";

import React from 'react';
import {
  Accordion as BaseAccordion,
  AccordionItem as BaseAccordionItem,
  AccordionTrigger as BaseAccordionTrigger,
  AccordionContent as BaseAccordionContent,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

/**
 * Props for Accordion component
 */
export type AccordionProps = React.ComponentProps<typeof BaseAccordion>;

/**
 * Styled Accordion Root Component
 *
 * A styled accordion container that follows the design system patterns.
 *
 * @example
 * ```tsx
 * <Accordion type="multiple" className="space-y-0">
 *   <AccordionItem value="item-1">
 *     <AccordionTrigger>Header</AccordionTrigger>
 *     <AccordionContent>Content</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */
export function Accordion({
  className,
  ...props
}: AccordionProps): React.JSX.Element {
  return (
    <BaseAccordion
      className={cn(
        // Design system base styles
        className
      )}
      {...props}
    />
  );
}

/**
 * Props for AccordionItem component
 */
export interface AccordionItemProps extends React.ComponentProps<typeof BaseAccordionItem> {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Styled Accordion Item Component
 *
 * A styled accordion item that follows the design system patterns.
 * Supports custom className while maintaining consistent base styles.
 *
 * @example
 * ```tsx
 * <AccordionItem value="item-1" className="mb-6">
 *   <AccordionTrigger>Header</AccordionTrigger>
 *   <AccordionContent>Content</AccordionContent>
 * </AccordionItem>
 * ```
 */
export function AccordionItem({
  className,
  ...props
}: AccordionItemProps): React.JSX.Element {
  return (
    <BaseAccordionItem
      className={cn(
        // Base styles - remove default border-b, allow custom borders
        "border-b-0",
        className
      )}
      {...props}
    />
  );
}

/**
 * Props for AccordionTrigger component
 */
export interface AccordionTriggerProps extends React.ComponentProps<typeof BaseAccordionTrigger> {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Styled Accordion Trigger Component
 *
 * A styled accordion trigger with design system hover effects and transitions.
 *
 * @example
 * ```tsx
 * <AccordionTrigger className="hover:bg-primary/5">
 *   Click to expand
 * </AccordionTrigger>
 * ```
 */
export function AccordionTrigger({
  className,
  ...props
}: AccordionTriggerProps): React.JSX.Element {
  return (
    <BaseAccordionTrigger
      className={cn(
        // Design system hover effects - no hover background
        "hover:no-underline transition-all duration-300",
        "hover:!bg-transparent",
        // Focus state for accessibility
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  );
}

/**
 * Props for AccordionContent component
 */
export interface AccordionContentProps extends React.ComponentProps<typeof BaseAccordionContent> {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Styled Accordion Content Component
 *
 * A styled accordion content area with consistent padding and spacing.
 *
 * @example
 * ```tsx
 * <AccordionContent className="text-sm">
 *   Content here
 * </AccordionContent>
 * ```
 */
export function AccordionContent({
  className,
  ...props
}: AccordionContentProps): React.JSX.Element {
  return (
    <BaseAccordionContent
      className={cn(
        // Base content styling
        "text-sm",
        className
      )}
      {...props}
    />
  );
}

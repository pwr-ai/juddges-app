/**
 * Header description style utilities
 * Modern, consistent description styling for headers with gradient text
 */

import { cn } from '@/lib/utils';

/**
 * Get header description style
 * Modern description styling with gradient text effect
 *
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <p className={getHeaderDescriptionStyle()}>
 * Ask a question about indexed legal documents to get started.
 * </p>
 */
export const getHeaderDescriptionStyle = (
  additionalClasses?: string
): string => {
  return cn(
    'text-sm md:text-base font-normal text-ink-soft leading-relaxed',
    'inline-flex items-center gap-1.5 flex-wrap',
    additionalClasses
  );
};

/**
 * Get description text style for description text spans
 */
export const getHeaderDescriptionGradientStyle = (
  additionalClasses?: string
): string => {
  return cn(
    'text-ink-soft',
    additionalClasses
  );
};

/**
 * Get header description style for inline content
 * For descriptions with badges, links, or other inline elements
 *
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getHeaderDescriptionInlineStyle = (
 additionalClasses?: string
): string => {
 return cn(
 getHeaderDescriptionStyle(),
 'flex items-center gap-2 flex-wrap',
 additionalClasses
 );
};

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
 // Typography
 'text-base md:text-lg',
 'font-normal',
 'leading-relaxed md:leading-loose',
 'tracking-normal',

 // Gradient text effect - applied to container
 'bg-gradient-to-br',
 'from-slate-700 via-slate-600 to-primary',
 '',
 'bg-clip-text',
 'text-transparent',

 // Spacing - no margin (handled by parent flex gap)

 // Max width for readability (removed to allow full width usage)
 // Use max-w-* classes in parent container if width constraint is needed

 // Modern effects
 'transition-all duration-200',

 // Ensure inline elements like badges render correctly
 // Note: Inline elements (like Badge) should override with their own text color
 'inline-flex items-center gap-1.5 flex-wrap',

 additionalClasses
 );
};

/**
 * Get gradient text style for description text spans
 * Apply this to individual text spans within the description
 */
export const getHeaderDescriptionGradientStyle = (
 additionalClasses?: string
): string => {
 return cn(
 // Gradient text effect - subtle gradient for description
 'bg-gradient-to-br',
 'from-slate-700 via-slate-600 to-primary',
 '',
 'bg-clip-text',
 'text-transparent',
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

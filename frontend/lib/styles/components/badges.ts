/**
 * Badge style utilities
 * Provides consistent badge styles for filter toggle groups and other components
 */

import { cn } from '@/lib/utils';

/**
 * Get filter toggle badge style for active/selected state
 * Used for badges within filter toggle buttons (e.g.,"AI"badge in Thinking mode)
 *
 * @param isActive - Whether the badge is in active/selected state
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Badge className={getFilterToggleBadgeStyle(true)}>
 * AI
 * </Badge>
 */
export const getFilterToggleBadgeStyle = (
 additionalClasses?: string
): string => {
 return cn(
"relative text-[10px] px-1.5 py-0.5 h-4 font-semibold flex items-center gap-0.5 transition-all rounded-lg",
 // BaseCard icon container style
"bg-gradient-to-br from-primary/10 via-indigo-400/10 to-purple-400/10",
 additionalClasses
 );
};

/**
 * Get filter toggle badge icon style
 * Used for icons within filter toggle badges
 *
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getFilterToggleBadgeIconStyle = (
 additionalClasses?: string
): string => {
 return cn(
"h-2.5 w-2.5 text-primary relative z-10",
 additionalClasses
 );
};

/**
 * Get filter toggle badge text style
 * Used for text within filter toggle badges
 *
 * @param isActive - Whether the badge is in active/selected state
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getFilterToggleBadgeTextStyle = (
 additionalClasses?: string
): string => {
 return cn(
"text-primary relative z-10",
 additionalClasses
 );
};

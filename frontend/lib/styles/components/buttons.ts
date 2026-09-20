/**
 * Button style utilities
 * Provides consistent Editorial button styles across the application
 */

import { cn } from '@/lib/utils';

/**
 * Get standardized active/selected button style
 * Use for toggle buttons, selected states, etc.
 *
 * @param size - Button size class (default: "h-8")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getActiveButtonStyle = (
  size: string = "h-8",
  additionalClasses?: string
): string => {
  return cn(
    size,
    "bg-parchment-deep text-ink border border-ink font-mono text-xs uppercase tracking-wider rounded-none shadow-none transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
    additionalClasses
  );
};

/**
 * Get standardized ghost button style for inactive states
 * Use for toggle buttons when not selected
 *
 * @param size - Button size class (default: "h-8")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getInactiveButtonStyle = (
  size: string = "h-8",
  additionalClasses?: string
): string => {
  return cn(
    size,
    "bg-parchment text-ink-soft hover:text-ink hover:bg-parchment-deep border border-rule font-mono text-xs uppercase tracking-wider rounded-none shadow-none transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
    additionalClasses
  );
};

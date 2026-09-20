/**
 * Button style utilities
 * Provides consistent Editorial button styles across the application
 */

import { cn } from '@/lib/utils';

/**
 * Get standardized primary button style
 * Use for main action buttons (Submit, Search, Save, etc.)
 *
 * @param size - Button size class (default: "h-9")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getPrimaryButtonStyle = (
  size: string = "h-9",
  additionalClasses?: string
): string => {
  return cn(
    size,
    "bg-oxblood hover:bg-oxblood-deep text-parchment font-mono text-xs uppercase tracking-wider rounded-none shadow-none transition-colors duration-150 border-0",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
    additionalClasses
  );
};

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

/**
 * Get icon button style for circular/square icon buttons
 * Use for Send, Stop, Edit actions
 *
 * @param variant - Button variant: 'primary' | 'destructive' | 'ghost' (default: 'primary')
 * @param size - Button size class (default: "h-7 w-7")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getIconButtonStyle = (
  variant: 'primary' | 'destructive' | 'ghost' = 'primary',
  size: string = "h-7 w-7",
  additionalClasses?: string
): string => {
  const variantStyles = {
    primary: "text-ink hover:text-oxblood hover:bg-parchment-deep border border-rule bg-parchment",
    destructive: "text-oxblood hover:text-oxblood-deep hover:bg-parchment-deep border border-rule bg-parchment",
    ghost: "text-ink-soft hover:text-ink hover:bg-parchment-deep border-0 bg-transparent",
  };

  return cn(
    size,
    "group relative rounded-none flex items-center justify-center p-0 transition-colors duration-150",
    variantStyles[variant],
    additionalClasses
  );
};

/**
 * Get secondary/outline button style
 * Use for date pickers, secondary actions
 *
 * @param size - Button size class (default: "h-8")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getSecondaryButtonStyle = (
  size: string = "h-8",
  additionalClasses?: string
): string => {
  return cn(
    size,
    "w-full justify-start text-left font-mono text-xs uppercase tracking-wider rounded-none transition-colors duration-150",
    "bg-parchment border border-rule text-ink hover:bg-parchment-deep shadow-none",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
    additionalClasses
  );
};

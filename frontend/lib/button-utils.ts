/**
 * Utility functions for button styling
 * Provides consistent Editorial button styles across the application
 */

import { cn } from "@/lib/utils";

/**
 * Standard styling for primary buttons across the application
 */
export const PRIMARY_GRADIENT = "bg-oxblood text-parchment";
export const PRIMARY_GRADIENT_HOVER = "hover:bg-oxblood-deep";

/**
 * Standard styling for active/selected state buttons
 */
export const ACTIVE_GRADIENT = "bg-parchment-deep text-ink border border-ink";
export const ACTIVE_GRADIENT_HOVER = "hover:bg-parchment-deep";

/**
 * Get the enhanced button style classes for primary buttons
 *
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getEnhancedButtonStyle = (additionalClasses?: string): string => {
  return cn(
    "bg-oxblood hover:bg-oxblood-deep text-parchment rounded-none shadow-none transition-colors duration-150",
    additionalClasses
  );
};

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
 * Get icon animation classes for buttons
 *
 * @param rotateDegrees - Degrees to rotate on hover
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 */
export const getIconAnimationStyle = (
  rotateDegrees: number = 90,
  additionalClasses?: string
): string => {
  const rotationClassMap: Record<number, string> = {
    12: "group-hover/btn:rotate-12",
    45: "group-hover/btn:rotate-45",
    90: "group-hover/btn:rotate-90",
    180: "group-hover/btn:rotate-180",
  };

  const rotationClass = rotationClassMap[rotateDegrees] || "group-hover/btn:rotate-90";

  return cn(
    "transition-transform duration-150",
    rotationClass,
    additionalClasses
  );
};

/**
 * Get complete button style with icon animation
 *
 * @param iconRotateDegrees - Degrees to rotate icon on hover (default: 90)
 * @param buttonClasses - Optional additional button classes
 * @param iconClasses - Optional additional icon classes
 * @returns Object with buttonClassName and iconClassName
 */
export const getCompleteButtonStyle = (
  iconRotateDegrees: number = 90,
  buttonClasses?: string,
  iconClasses?: string
) => {
  return {
    buttonClassName: getEnhancedButtonStyle(buttonClasses),
    iconClassName: getIconAnimationStyle(iconRotateDegrees, iconClasses),
  };
};

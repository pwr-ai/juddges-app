/**
 * Utility functions for button styling
 * Provides consistent button styles across the application
 */

import { cn } from "@/lib/utils";

/**
 * Standard gradient for primary buttons across the application
 * Uses: from-primary to-primary/90 (single color, no multiple colors)
 */
export const PRIMARY_GRADIENT ="bg-gradient-to-r from-primary to-primary/90";
export const PRIMARY_GRADIENT_HOVER ="hover:from-primary/90 hover:to-primary/80";

/**
 * Standard gradient for active/selected state buttons
 * Same as primary gradient for consistency
 */
export const ACTIVE_GRADIENT = PRIMARY_GRADIENT;
export const ACTIVE_GRADIENT_HOVER = PRIMARY_GRADIENT_HOVER;

/**
 * Get the enhanced button style classes for primary buttons
 * Includes shadow effects, transitions, and group animations
 *
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Button className={getEnhancedButtonStyle()}>
 * Click me
 * </Button>
 */
export const getEnhancedButtonStyle = (additionalClasses?: string): string => {
 return cn(
"shadow-lg hover:shadow-xl group/btn transition-all",
 additionalClasses
 );
};

/**
 * Get standardized primary button style with gradient
 * Use for main action buttons (Submit, Search, Save, etc.)
 *
 * @param size - Button size class (default: "h-9")
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Button className={getPrimaryButtonStyle()}>
 * Submit
 * </Button>
 */
export const getPrimaryButtonStyle = (
 size: string ="h-9",
 additionalClasses?: string
): string => {
 return cn(
 size,
 PRIMARY_GRADIENT,
 PRIMARY_GRADIENT_HOVER,
"text-white shadow-lg hover:shadow-xl",
"transition-all duration-300",
"group/btn",
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
 *
 * @example
 * <Button className={getActiveButtonStyle()}>
 * Selected
 * </Button>
 */
export const getActiveButtonStyle = (
 size: string ="h-8",
 additionalClasses?: string
): string => {
 return cn(
 size,
 ACTIVE_GRADIENT,
"text-white shadow-sm",
"hover:shadow-lg hover:scale-105",
"hover:-translate-y-0.5",
"active:scale-100 active:translate-y-0",
"transition-all duration-300 ease-out",
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
 *
 * @example
 * <Button variant="ghost"className={getInactiveButtonStyle()}>
 * Not Selected
 * </Button>
 */
export const getInactiveButtonStyle = (
 size: string ="h-8",
 additionalClasses?: string
): string => {
 return cn(
 size,
"bg-transparent",
"hover:bg-slate-100 hover: ",
"hover:text-foreground",
"[&:hover]:!bg-slate-100",
"[&:hover]:!text-foreground",
"hover:scale-105 hover:shadow-md",
"hover:-translate-y-0.5",
"active:scale-100 active:translate-y-0",
"transition-all duration-300 ease-out",
 additionalClasses
 );
};

/**
 * Get icon animation classes for buttons
 * Provides scale and rotation effects on hover
 *
 * @param rotateDegrees - Degrees to rotate on hover (default: 90 for Plus icons, 12 for ExternalLink)
 * @param additionalClasses - Optional additional classes to merge
 * @returns Combined className string
 *
 * @example
 * <Plus className={cn("h-4 w-4 mr-2", getIconAnimationStyle())} />
 */
export const getIconAnimationStyle = (
 rotateDegrees: number = 90,
 additionalClasses?: string
): string => {
 // Map common rotation values to Tailwind classes
 const rotationClassMap: Record<number, string> = {
 12: "group-hover/btn:rotate-12",
 45: "group-hover/btn:rotate-45",
 90: "group-hover/btn:rotate-90",
 180: "group-hover/btn:rotate-180",
 };

 const rotationClass = rotationClassMap[rotateDegrees] || "group-hover/btn:rotate-90";

 return cn(
"group-hover/btn:scale-110 transition-all",
 rotationClass,
 additionalClasses
 );
};

/**
 * Get complete button style with icon animation
 * Combines button and icon styles for convenience
 *
 * @param iconRotateDegrees - Degrees to rotate icon on hover (default: 90)
 * @param buttonClasses - Optional additional button classes
 * @param iconClasses - Optional additional icon classes
 * @returns Object with buttonClassName and iconClassName
 *
 * @example
 * const { buttonClassName, iconClassName } = getCompleteButtonStyle();
 * <Button className={buttonClassName}>
 * <Plus className={iconClassName} />
 * New Item
 * </Button>
 */
export const getCompleteButtonStyle = (
 iconRotateDegrees: number = 90,
 buttonClasses?: string,
 iconClasses?: string
) => {
 return {
 buttonClassName: getEnhancedButtonStyle(buttonClasses),
 iconClassName: getIconAnimationStyle(iconRotateDegrees, iconClasses)
 };
};

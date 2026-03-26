/**
 * Button style utilities
 * Provides consistent button styles across the application
 */

import { cn } from '@/lib/utils';
import { buttonGradients } from '@/lib/styles/colors/gradients';
import { cardBackgroundGradients } from '@/lib/styles/colors/surfaces';

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
 `bg-gradient-to-r ${buttonGradients.primary}`,
 buttonGradients.primaryHover,
"text-white shadow-lg hover:shadow-xl",
"transition-all duration-300",
"group/btn",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 additionalClasses
 );
};

/**
 * Get standardized active/selected button style
 * Matches card design pattern with subtle gradients, borders, and rings
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
"group relative overflow-hidden",
 // Background gradient from BaseCard for visual consistency
 cardBackgroundGradients.base.light,
 // Border and ring matching selected card state - less visible
"border border-primary/30",
"ring-1 ring-primary/10",
 // Shadow matching card design
"shadow-sm shadow-primary/10",
 // Text color that works with gradient background
"text-foreground font-medium",
 // Hover effects - VERY visible
"group-hover:border-primary/70",
"hover:shadow-xl hover:shadow-primary/30",
"hover:scale-[1.05]",
"hover:brightness-110",
"hover:ring-2 hover:ring-primary/40",
 // Active state for tactile feedback
"active:scale-[0.96] active:opacity-90",
"transition-[transform,shadow,border-color,filter,ring] duration-200 ease-out",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
"group relative overflow-hidden",
 // Background gradient using semantic tokens - override ghost variant
"!bg-gradient-to-br !from-background !via-background/80 !to-muted/80",
 // More visible text color - can be overridden by component if needed
"text-foreground/75",
 // Border using semantic tokens
"border border-border/50",
 // Shadow to make it stand out from background
"shadow-sm",
 // Hover effects using semantic tokens - override ghost variant completely - VERY visible
"!hover:bg-gradient-to-br !hover:from-muted !hover:via-muted/95 !hover:to-muted/90",
"!hover:text-foreground",
"group-hover:border-border",
"hover:shadow-lg hover:shadow-primary/30",
"hover:scale-[1.05]",
"hover:brightness-110",
"hover:ring-2 hover:ring-primary/30",
"transition-[transform,shadow,border-color,background-color,filter,ring] duration-200 ease-out",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
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
 *
 * @example
 * <Button className={getIconButtonStyle('primary')}>
 * <Send className="h-4 w-4"/>
 * </Button>
 */
export const getIconButtonStyle = (
 variant: 'primary' | 'destructive' | 'ghost' = 'primary',
 size: string ="h-7 w-7",
 additionalClasses?: string
): string => {
 const variantStyles = {
 primary: cn(
"text-primary hover:text-primary",
"hover:scale-110 hover:shadow-lg hover:shadow-primary/20",
"active:scale-[0.95] active:opacity-80",
"[&>div]:bg-primary/10 [&>div]:opacity-0 [&>div]:group-hover:opacity-100"
 ),
 destructive: cn(
"text-destructive hover:text-destructive",
"hover:scale-110 hover:shadow-lg hover:shadow-destructive/20",
"active:scale-[0.95] active:opacity-80",
"[&>div]:bg-destructive/10 [&>div]:opacity-0 [&>div]:group-hover:opacity-100"
 ),
 ghost: cn(
"text-muted-foreground",
"hover:text-foreground",
"hover:bg-muted",
"hover:shadow-sm active:scale-95"
 ),
 };

 return cn(
 size,
"group relative rounded-full flex-shrink-0 p-0 transition-all duration-200",
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
 *
 * @example
 * <Button variant="outline"className={getSecondaryButtonStyle()}>
 * Select Date
 * </Button>
 */
export const getSecondaryButtonStyle = (
 size: string ="h-8",
 additionalClasses?: string
): string => {
 return cn(
 size,
"w-full justify-start text-left font-medium rounded-xl transition-all duration-300",
"bg-background/50 backdrop-blur-sm",
"border-border/50",
"hover:bg-background/80",
"hover:scale-[1.02] hover:shadow-md",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 additionalClasses
 );
};

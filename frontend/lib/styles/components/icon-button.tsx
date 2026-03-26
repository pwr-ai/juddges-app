/**
 * Icon Button Component
 * Reusable icon-only button component
 * Used for icon-only actions like dismiss, close, etc.
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for IconButton component
 */
export interface IconButtonProps {
 /** Icon component */
 icon: React.ComponentType<{ className?: string }>;
 /** Click handler */
 onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Optional aria label for accessibility */
"aria-label"?: string;
 /** Size variant */
 size?: "sm"|"md"|"lg";
 /** Color variant */
 variant?: "default"|"error"|"primary"|"muted";
 /** Hover behavior: "background"shows background on hover,"color"only changes icon color */
 hoverStyle?: "background"|"color";
 /** Compact mode: reduces padding for smaller hover area */
 compact?: boolean;
 /** Icon hover animation: "scale"|"rotate"|"none"*/
 iconHover?: "scale"|"rotate"|"none";
 /**
 * Enhanced hover visibility - makes hover effects more prominent
 *
 * Use for primary actions and important interactive elements.
 *
 * Effects:
 * - Stronger shadows (shadow-xl with colored glow)
 * - Larger scale transformation (1.15x vs 1.10x)
 * - Visible borders (border-primary/60)
 * - Additional ring effect (ring-2)
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedHover?: boolean;
 /**
 * Enhanced focus visibility - makes focus ring larger and more visible
 *
 * Use for accessibility-critical elements like modal close buttons.
 *
 * Effects:
 * - Larger focus ring (ring-4 vs ring-2)
 * - Stronger opacity (primary/80 vs primary)
 * - Larger offset (offset-4 vs offset-2)
 * - Additional shadow for visibility
 *
 * Recommended for:
 * - Close buttons on modals/dialogs
 * - Navigation elements
 * - Form inputs in multi-step flows
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedFocus?: boolean;
 /**
 * Enhanced active visibility - makes active state more visible
 *
 * Provides stronger tactile feedback on button press.
 *
 * Effects:
 * - Stronger scale reduction (0.90x vs 0.95x)
 * - More visible opacity change (70% vs 80%)
 * - Border feedback (border-primary/50)
 * - Ring feedback (ring-2)
 *
 * Use for high-stakes interactions like:
 * - Destructive actions
 * - Form submissions
 * - State changes
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedActive?: boolean;
 /**
 * Disable all hover effects from IconButton
 *
 * When true, IconButton will not apply any hover styles, allowing
 * the className prop to fully control hover behavior.
 *
 * @default false
 */
 disableHover?: boolean;
}

/**
 * Icon Button Component
 *
 * A reusable icon-only button component.
 * Supports different sizes and color variants.
 *
 * @example
 * ```tsx
 * <IconButton
 * icon={X}
 * onClick={() => handleClose()}
 * aria-label="Close"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <IconButton
 * icon={X}
 * variant="error"
 * size="md"
 * onClick={() => setError(null)}
 * aria-label="Dismiss error"
 * />
 * ```
 */
export function IconButton({
 icon: Icon,
 onClick,
 className,
 disabled = false,
 type ="button",
"aria-label": ariaLabel,
 size ="md",
 variant ="default",
 hoverStyle ="background",
 compact = false,
 iconHover ="scale",
 enhancedHover = false,
 enhancedFocus = false,
 enhancedActive = false,
 disableHover = false,
 ...rest
}: IconButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
 const sizeClasses = {
 sm: compact ? "p-1 h-11 w-11": "p-2 h-11 w-11", // Minimum 44x44px touch target (h-11 w-11 = 44px)
 md: compact ? "p-1 h-11 w-11": "p-1.5 h-11 w-11", // Minimum 44x44px touch target (h-11 w-11 = 44px)
 lg: compact ? "p-1.5 h-11 w-11": "p-2 h-12 w-12", // lg can be larger, compact mode meets minimum
 };

 const iconSizes = {
 sm: "h-3 w-3",
 md: "h-4 w-4",
 lg: "h-5 w-5",
 };

 // Base variant classes (without hover)
 const baseVariantClasses = {
 default: "text-foreground",
 error: "text-destructive",
 primary: "text-primary",
 muted: "text-muted-foreground",
 };

 // Hover classes based on hoverStyle prop
 const getHoverClasses = (): string => {
 if (hoverStyle === "color") {
 // Only change color on hover, no background or border - make it more visible
 const colorHoverClasses = {
 default: "hover:text-foreground",
 error: "hover:text-destructive",
 primary: "hover:text-primary",
 muted: "hover:text-foreground",
 };
 return colorHoverClasses[variant];
 } else {
 // Background hover (default behavior)
 const backgroundHoverClasses = {
 default: "hover:bg-muted",
 error: "hover:bg-destructive/10 hover:text-destructive",
 primary: "hover:bg-primary/10",
 muted: "hover:bg-muted",
 };
 return backgroundHoverClasses[variant];
 }
 };

 // Enhanced hover classes - more visible per styling guide
 const getEnhancedHoverClasses = (): string => {
 if (variant === "primary") {
 return"hover:bg-primary/30 hover:shadow-xl hover:shadow-primary/50 hover:border hover:border-primary/60 hover:ring-2 hover:ring-primary/30";
 }
 return"hover:bg-primary/30 hover:shadow-xl hover:shadow-primary/50 hover:border hover:border-primary/60 hover:ring-2 hover:ring-primary/30";
 };

 // Check if className includes custom hover styles - if so, disable IconButton's hover effects
 // Check both the raw className and the final merged className to be safe
 const classNameStr = typeof className === 'string' ? className : '';
 const hasCustomHover = disableHover || (classNameStr.includes("hover: "));

 return (
 <button
 type={type}
 onClick={(e) => onClick?.(e)}
 disabled={disabled}
 aria-label={ariaLabel}
 className={cn(
"rounded-lg",
"transition-all duration-200",
"flex items-center justify-center",
"flex-shrink-0",
"group",
 // Only apply border-0 if className doesn't include border classes
 !classNameStr.includes("border") &&"border-0",
 sizeClasses[size],
 baseVariantClasses[variant],
 // Only apply IconButton's hover classes if hover is not disabled
 !hasCustomHover && !enhancedHover && getHoverClasses(),
 !hasCustomHover && enhancedHover && getEnhancedHoverClasses(),
 // Scale effects - only if hover is not disabled
 !hasCustomHover && hoverStyle === "color"&&"hover:scale-125 hover:bg-transparent",
 !hasCustomHover && !enhancedHover && hoverStyle === "background"&&"hover:scale-110",
 !hasCustomHover && enhancedHover && hoverStyle === "background"&&"hover:scale-115",
 // Active state for tactile feedback - default
 !enhancedActive &&"active:scale-[0.95] active:opacity-80",
 // Enhanced active - more visible with border (matching hover style)
 enhancedActive &&"active:scale-[0.90] active:opacity-70",
 enhancedActive &&"active:border active:border-primary/50",
 enhancedActive &&"active:ring-2 active:ring-primary/30",
 // Focus state for accessibility - default
 !enhancedFocus &&"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 // Enhanced focus - more visible
 enhancedFocus &&"focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
 enhancedFocus &&"focus-visible:shadow-lg focus-visible:shadow-primary/50",
 disabled &&"opacity-50 cursor-not-allowed",
 className
 )}
 {...rest}
 >
 <Icon className={cn(
 iconSizes[size],
"transition-transform duration-200",
 // Apply icon hover effects - allow even when disableHover is true (icon hover is separate from button hover)
 iconHover === "scale"&&"group-hover:scale-125",
 iconHover === "rotate"&&"group-hover:rotate-15",
 iconHover === "none"&&""
 )} />
 </button>
 );
}

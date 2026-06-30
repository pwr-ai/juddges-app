/**
 * Icon Button Component
 * Reusable icon-only button component
 * Used for icon-only actions like dismiss, close, etc.
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { iconButtonClassName } from './button-variants';

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
 const iconSizes = {
 sm: "h-3 w-3",
 md: "h-4 w-4",
 lg: "h-5 w-5",
 };

 return (
 <button
 type={type}
 onClick={(e) => onClick?.(e)}
 disabled={disabled}
 aria-label={ariaLabel}
 className={iconButtonClassName({
 size,
 variant,
 hoverStyle,
 compact,
 enhancedHover,
 enhancedFocus,
 enhancedActive,
 disableHover,
 disabled,
 className,
 })}
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

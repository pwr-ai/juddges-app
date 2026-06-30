/**
 * Secondary Button Component
 * Reusable secondary/outline action button component
 * Used for secondary actions like Retry, Dismiss, Back, etc.
 */

"use client";

import React, { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { secondaryButtonClassName } from './button-variants';

import Link from 'next/link';

/**
 * Props for SecondaryButton component
 */
export interface SecondaryButtonProps {
 /** Button text/content */
 children: React.ReactNode;
 /** Click handler */
 onClick?: React.MouseEventHandler<HTMLButtonElement>;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Optional icon to display before text */
 icon?: React.ComponentType<{ className?: string }>;
 /** Button size */
 size?: "sm"|"md"|"lg";
 /**
 * Enhanced hover visibility - makes hover effects more prominent
 *
 * Use for secondary actions that need emphasis, like"Retry"or"Back".
 *
 * Effects:
 * - Fully opaque background (bg-white vs bg-white/80)
 * - Lift effect (scale 1.08 + -translate-y-1)
 * - Stronger shadow (shadow-xl with primary/50 glow)
 * - Primary color text and border
 * - Ring effect (ring-2 ring-primary/40)
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedHover?: boolean;
 /**
 * Enhanced focus visibility - makes focus ring larger and more visible
 *
 * Important for secondary actions in keyboard navigation flows.
 *
 * Effects:
 * - Larger focus ring (ring-4 vs ring-2)
 * - Higher visibility (primary/80 vs primary)
 * - Larger offset (offset-4 vs offset-2)
 * - Border emphasis (border-primary/70)
 * - Shadow glow (shadow-lg with primary/50)
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedFocus?: boolean;
 /**
 * Enhanced active visibility - makes active state more visible
 *
 * Provides clear tactile feedback for secondary actions.
 *
 * Effects:
 * - Noticeable scale reduction (0.95x vs 0.98x)
 * - Opacity reduction (80% vs 90%)
 * - Border feedback (border-primary/50)
 * - Ring feedback (ring-2 ring-primary/30)
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedActive?: boolean;
 /** Optional aria-label for accessibility */
"aria-label"?: string;
 /**
 * Optional href. If provided, renders as a Link.
 */
 href?: string;
}

/**
 * Secondary Button Component
 *
 * A reusable secondary/outline button component for secondary actions.
 * Uses consistent styling with backdrop blur and hover effects.
 * Supports ref forwarding for compatibility with Radix UI's asChild pattern.
 *
 * @example
 * ```tsx
 * <SecondaryButton onClick={() => handleClick()}>
 * Retry
 * </SecondaryButton>
 * ```
 *
 * @example
 * ```tsx
 * <SecondaryButton href="/retry">
 * Retry Search
 * </SecondaryButton>
 * ```
 */
export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(({
 children,
 onClick,
 className,
 disabled = false,
 type ="button",
 icon: Icon,
 size ="md",
 enhancedHover = false,
 enhancedFocus = false,
 enhancedActive = false,
"aria-label": ariaLabel,
 href,
}, ref) => {
 const commonClasses = secondaryButtonClassName({
 size,
 enhancedHover,
 enhancedFocus,
 enhancedActive,
 className,
 });

 const content = (
 <>
 {Icon && <Icon className="mr-2 h-4 w-4"/>}
 {children}
 </>
 );

 if (href && !disabled) {
 return (
 <Link href={href} className={cn(commonClasses,"border")}>
 {content}
 </Link>
 );
 }

 return (
 <Button
 ref={ref}
 type={type}
 onClick={onClick}
 disabled={disabled}
 variant="outline"
 aria-label={ariaLabel}
 className={commonClasses}
 >
 {content}
 </Button>
 );
});

SecondaryButton.displayName ="SecondaryButton";

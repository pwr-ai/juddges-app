/**
 * Secondary Button Component
 * Reusable secondary/outline action button component
 * Used for secondary actions like Retry, Dismiss, Back, etc.
 */

"use client";

import React, { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
 const sizeClasses = {
 sm: "text-sm h-9 px-4 rounded-xl",
 md: "text-sm h-10 px-5 rounded-xl",
 lg: "text-base h-11 px-6 rounded-xl",
 };

 const commonClasses = cn(
 sizeClasses[size],
"inline-flex items-center justify-center",
"transition-all duration-300",
 // Glassmorphism 2.0 base styling
"bg-white/70 backdrop-blur-xl backdrop-saturate-[200%]",
"border border-white/80",
"shadow-[0_4px_16px_rgba(15,23,42,0.08),0_0_20px_rgba(99,102,241,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]",
"",
 // Default hover
 !enhancedHover &&"hover:bg-white/85",
 !enhancedHover &&"hover:scale-105 hover:shadow-[0_6px_20px_rgba(15,23,42,0.12),0_0_30px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]",
 !enhancedHover &&"hover:border-white/90",
 // Enhanced hover - more visible per styling guide (white/black overlay pattern)
 enhancedHover &&"hover:bg-white",
 enhancedHover &&"hover:border-primary/80",
 enhancedHover &&"hover:shadow-[0_8px_32px_rgba(15,23,42,0.15),0_4px_16px_rgba(99,102,241,0.12),0_0_40px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,1)]",
 enhancedHover &&"",
 enhancedHover &&"hover:scale-[1.08] hover:-translate-y-1",
 enhancedHover &&"hover:text-primary",
 enhancedHover &&"hover:ring-2 hover:ring-primary/40",
 // Active state for tactile feedback - default
 !enhancedActive &&"active:scale-[0.98] active:opacity-90",
 // Enhanced active - more visible with border (matching hover style)
 enhancedActive &&"active:scale-[0.95] active:opacity-80",
 enhancedActive &&"active:border-primary/50",
 enhancedActive &&"active:ring-2 active:ring-primary/30",
"font-semibold",
 // Focus state for accessibility - default
 !enhancedFocus &&"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 // Enhanced focus - more visible
 enhancedFocus &&"focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
 enhancedFocus &&"focus-visible:border-primary/70",
 enhancedFocus &&"focus-visible:shadow-lg focus-visible:shadow-primary/50",
 className
 );

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

/**
 * Primary Button Component
 * Reusable highlighted/primary action button component
 * Used for main actions like Search, Submit, Save, etc.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRIMARY_GRADIENT, PRIMARY_GRADIENT_HOVER } from '@/lib/button-utils';

import Link from 'next/link';

/**
 * Props for PrimaryButton component
 */
export interface PrimaryButtonProps {
 /** Button text/content */
 children: React.ReactNode;
 /** Click handler */
 onClick?: () => void;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Optional icon to display before text */
 icon?: React.ComponentType<{ className?: string }>;
 /** Optional loading state - shows loading text */
 isLoading?: boolean;
 /** Optional loading text */
 loadingText?: string;
 /** Button size */
 size?: "sm"|"md"|"lg"|"xl";
 /**
 * Enhanced active visibility - makes active state more visible
 *
 * Provides clear feedback that the primary action is being executed.
 *
 * Effects:
 * - Noticeable scale reduction (0.95x vs 1.0x)
 * - Opacity reduction for feedback (80%)
 * - Border emphasis (border-primary/50)
 * - Ring effect (ring-2 ring-primary/30)
 *
 * @default false
 * @see {@link /frontend/lib/styles/components/ENHANCEMENT_PATTERN_GUIDE.md}
 */
 enhancedActive?: boolean;
 /**
 * Optional href. If provided, renders as a Link.
 */
 href?: string;
}

/**
 * Primary Button Component
 *
 * A reusable highlighted button component for primary actions.
 * Uses the primary button gradient styling with consistent hover effects.
 *
 * @example
 * ```tsx
 * <PrimaryButton onClick={() => handleClick()}>
 * Search
 * </PrimaryButton>
 * ```
 *
 * @example
 * ```tsx
 * <PrimaryButton href="/search">
 * Search
 * </PrimaryButton>
 * ```
 */
export function PrimaryButton({
 children,
 onClick,
 className,
 disabled = false,
 type ="button",
 icon: Icon,
 isLoading = false,
 loadingText,
 size ="md",
 enhancedActive = false,
 href,
}: PrimaryButtonProps): React.JSX.Element {
 const sizeClasses = {
 sm: "h-9 px-6 rounded-xl text-sm",
 md: "h-12 px-8 rounded-xl text-base",
 lg: "h-14 px-10 rounded-2xl text-base",
 xl: "h-16 px-10 rounded-2xl text-base",
 };

 const isDisabled = disabled || isLoading;

 // Check if this is a"Start Extraction"button for enhanced glassmorphism 2.0
 const isExtractionButton = typeof children === 'string' && children.includes('Start Extraction');

 const commonClasses = cn(
 PRIMARY_GRADIENT,
 PRIMARY_GRADIENT_HOVER,
"group relative overflow-hidden inline-flex items-center justify-center",
 sizeClasses[size],
"font-semibold",
"text-white",
"shadow-lg hover:shadow-xl",
"transition-all duration-300",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 isDisabled &&"opacity-70 cursor-not-allowed",
 // Enhanced glassmorphism 2.0 for extraction buttons - darker blue, subtle gradients, more transparency, less glow
 isExtractionButton && [
"backdrop-blur-[40px] backdrop-saturate-[220%]",
"bg-gradient-to-r from-blue-700/70 via-blue-600/70 to-indigo-700/70",
"shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_8px_32px_rgba(30,58,138,0.2),0_4px_16px_rgba(30,58,138,0.15),inset_0_1px_0_rgba(255,255,255,1)]",
"hover:from-blue-700/75 hover:via-blue-600/75 hover:to-indigo-700/75",
"hover:shadow-[0_0_0_1px_rgba(255,255,255,1),0_8px_32px_rgba(30,58,138,0.25),0_4px_16px_rgba(30,58,138,0.2),inset_0_1px_0_rgba(255,255,255,1)]",
"hover:-translate-y-0.5",
"",
"",
 ],
 className
 );

 const content = (
 <>
 {isLoading ? (
 <>
 <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"/>
 {loadingText && <span>{loadingText}</span>}
 </>
 ) : (
 <>
 {Icon && <Icon className="h-4 w-4 mr-2"/>}
 <span>{children}</span>
 </>
 )}
 </>
 );

 if (href && !isDisabled) {
 return (
 <Link href={href} className={commonClasses}>
 {content}
 </Link>
 );
 }

 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={isDisabled}
 className={commonClasses}
 >
 {content}
 </Button>
 );
}

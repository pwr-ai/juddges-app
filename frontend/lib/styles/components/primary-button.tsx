/**
 * Primary Button Component
 * Reusable highlighted/primary action button component
 * Used for main actions like Search, Submit, Save, etc.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { primaryButtonClassName } from './button-variants';

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
 const isDisabled = disabled || isLoading;

 // Check if this is a"Start Extraction"button for enhanced glassmorphism 2.0
 const isExtractionButton = typeof children === 'string' && children.includes('Start Extraction');

 const commonClasses = primaryButtonClassName(
 size,
 isDisabled,
 isExtractionButton,
 className,
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

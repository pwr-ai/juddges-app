/**
 * Accent Button Component
 * Reusable accent button with gradient background
 * Used for accent actions like Save All Results, etc.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { accentButtonSizes, accentButtonBase } from './button-variants';

/**
 * Props for AccentButton component
 */
export interface AccentButtonProps {
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
}

/**
 * Accent Button Component
 *
 * A reusable accent button component with gradient background.
 * Uses primary gradient colors at low opacity for subtle accent styling.
 *
 * @example
 * ```tsx
 * <AccentButton onClick={() => handleClick()}>
 * Save All
 * </AccentButton>
 * ```
 *
 * @example
 * ```tsx
 * <AccentButton
 * icon={BookmarkIcon}
 * size="sm"
 * >
 * Save All Results
 * </AccentButton>
 * ```
 */
export function AccentButton({
 children,
 onClick,
 className,
 disabled = false,
 type ="button",
 icon: Icon,
 size ="sm",
}: AccentButtonProps): React.JSX.Element {
 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={disabled}
 variant="outline"
 className={cn(accentButtonSizes[size], accentButtonBase, className)}
 >
 {Icon && <Icon className="mr-1.5 h-3.5 w-3.5"/>}
 {children}
 </Button>
 );
}

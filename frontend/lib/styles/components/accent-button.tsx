/**
 * Accent Button Component
 * Reusable accent button with gradient background
 * Used for accent actions like Save All Results, etc.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
 const sizeClasses = {
 sm: "text-sm h-9 px-4 rounded-xl",
 md: "text-sm h-10 px-5 rounded-xl",
 lg: "text-base h-11 px-6 rounded-xl",
 };

 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={disabled}
 variant="outline"
 className={cn(
 sizeClasses[size],
"transition-all duration-300",
"bg-gradient-to-r from-primary/10 via-blue-500/10 to-cyan-500/10",
"",
"border-primary/30",
"text-primary",
"hover:from-primary/15 hover:via-blue-500/15 hover:to-cyan-500/15",
"",
"hover:scale-105 hover:shadow-md",
 // Active state for tactile feedback
"active:scale-[0.98] active:opacity-90",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 className
 )}
 >
 {Icon && <Icon className="mr-1.5 h-3.5 w-3.5"/>}
 {children}
 </Button>
 );
}

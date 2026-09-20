/**
 * Toggle Button Component
 * Reusable toggle button component
 * Used for toggle states like Batch Mode, etc.
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActiveButtonStyle, getInactiveButtonStyle } from './buttons';

/**
 * Props for ToggleButton component
 */
export interface ToggleButtonProps {
 /** Button text/content */
 children: React.ReactNode;
 /** Click handler */
 onClick?: () => void;
 /** Whether the button is active/toggled */
 isActive: boolean;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Optional icon to display before text */
 icon?: React.ComponentType<{ className?: string }>;
 /** Optional icon for inactive state */
 inactiveIcon?: React.ComponentType<{ className?: string }>;
 /** Button size */
 size?: "sm"|"md"|"lg";
}

/**
 * Toggle Button Component
 *
 * A reusable toggle button component that switches between active and inactive states.
 * Uses getActiveButtonStyle and getInactiveButtonStyle utilities.
 *
 * @example
 * ```tsx
 * <ToggleButton
 * isActive={isBatchMode}
 * onClick={toggleBatchMode}
 * >
 * Batch Mode
 * </ToggleButton>
 * ```
 *
 * @example
 * ```tsx
 * <ToggleButton
 * isActive={isBatchMode}
 * onClick={toggleBatchMode}
 * icon={CheckSquare}
 * inactiveIcon={Square}
 * size="sm"
 * >
 * {isBatchMode ? "Batch Mode": "Select Multiple"}
 * </ToggleButton>
 * ```
 */
export function ToggleButton({
 children,
 onClick,
 isActive,
 className,
 disabled = false,
 type = "button",
 icon: ActiveIcon,
 inactiveIcon: InactiveIcon,
 size = "sm",
}: ToggleButtonProps): React.JSX.Element {
 const sizeClasses = {
 sm: "text-xs h-8 px-3 rounded-none font-mono uppercase tracking-wider",
 md: "text-xs h-9 px-4 rounded-none font-mono uppercase tracking-wider",
 lg: "text-sm h-10 px-5 rounded-none font-mono uppercase tracking-wider",
 };

 const iconSizes = {
 sm: "h-3.5 w-3.5",
 md: "h-4 w-4",
 lg: "h-5 w-5",
 };

 const Icon = isActive ? ActiveIcon : InactiveIcon;

 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={disabled}
 variant={isActive ? "default" : "outline"}
 className={cn(
 sizeClasses[size],
 "transition-colors duration-150 shadow-none",
 isActive
 ? getActiveButtonStyle(sizeClasses[size])
 : getInactiveButtonStyle(sizeClasses[size]),
 "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
 className
 )}
 >
 {Icon && <Icon className={cn(iconSizes[size], "mr-1.5")} />}
 {children}
 </Button>
 );
}

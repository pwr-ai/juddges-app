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
 type ="button",
 icon: ActiveIcon,
 inactiveIcon: InactiveIcon,
 size ="sm",
}: ToggleButtonProps): React.JSX.Element {
 const sizeClasses = {
 sm: "text-xs h-9 px-4 rounded-xl",
 md: "text-sm h-10 px-5 rounded-xl",
 lg: "text-base h-11 px-6 rounded-xl",
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
 variant={isActive ? "default": "outline"}
 className={cn(
 sizeClasses[size],
"transition-all duration-300",
 isActive
 ? getActiveButtonStyle(sizeClasses[size])
 : getInactiveButtonStyle(sizeClasses[size]),
 // Active state for tactile feedback
"active:scale-[0.98] active:opacity-90",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 // Colorblind accessibility: add border/ring changes for state
 isActive &&"ring-2 ring-primary/30",
 !isActive &&"ring-1 ring-slate-200/30",
 className
 )}
 >
 {Icon && <Icon className={cn(iconSizes[size],"mr-1.5")} />}
 {children}
 </Button>
 );
}

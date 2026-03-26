/**
 * Delete Button Component
 * Reusable destructive action button component
 * Used for delete, remove, and other destructive actions
 */

"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Trash2, LucideIcon } from 'lucide-react';

/**
 * Props for DeleteButton component
 */
export interface DeleteButtonProps {
 /** Button text/content */
 children?: React.ReactNode;
 /** Click handler */
 onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
 /** Optional className for additional styling */
 className?: string;
 /** Optional disabled state */
 disabled?: boolean;
 /** Button type */
 type?: "button"|"submit"|"reset";
 /** Optional icon component (default: Trash2) */
 icon?: LucideIcon;
 /** Button size */
 size?: "sm"|"md"|"lg";
 /** Whether action is in progress */
 isLoading?: boolean;
}

/**
 * Delete Button Component
 *
 * A reusable destructive action button component for delete, remove, and other destructive actions.
 * Uses design system colors and follows accessibility guidelines.
 *
 * @example
 * ```tsx
 * <DeleteButton onClick={() => handleDelete()}>
 * Delete
 * </DeleteButton>
 * ```
 *
 * @example
 * ```tsx
 * <DeleteButton
 * icon={Trash2}
 * size="md"
 * isLoading={isDeleting}
 * >
 * Delete Chat
 * </DeleteButton>
 * ```
 */
export function DeleteButton({
 children ="Delete",
 onClick,
 className,
 disabled = false,
 type ="button",
 icon: Icon = Trash2,
 size ="md",
 isLoading = false,
}: DeleteButtonProps): React.JSX.Element {
 const sizeClasses = {
 sm: "text-xs h-9 px-4 rounded-xl",
 md: "text-sm h-10 px-5 rounded-xl",
 lg: "text-base h-11 px-6 rounded-xl",
 };

 const iconSizes = {
 sm: "h-4 w-4",
 md: "h-4 w-4",
 lg: "h-5 w-5",
 };

 return (
 <Button
 type={type}
 onClick={onClick}
 disabled={disabled || isLoading}
 variant="destructive"
 className={cn(
 sizeClasses[size],
"transition-all duration-300",
 // Red gradient background following design system gradient pattern
 // Similar to PrimaryButton but with red semantic colors for destructive actions
"!bg-gradient-to-br !from-red-600 !via-red-700 !to-red-800",
"",
"hover:!from-red-700 hover:!via-red-800 hover:!to-red-900",
"",
"!text-white",
 // Border following design system pattern - using /50 opacity from standardized scale
"!border !border-red-600/50",
"hover:!border-red-700/50",
 // Shadow following design system pattern (shadow-2xl shadow-primary/10) - using /30 opacity
"hover:scale-105 hover:shadow-md hover:shadow-red-600/30",
 // Active state for tactile feedback
"active:scale-[0.98] active:opacity-90",
"font-semibold",
 // Focus state for accessibility - following design system pattern
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2",
 // Loading state
 isLoading &&"opacity-50 cursor-wait",
 className
 )}
 >
 {Icon && <Icon className={cn(iconSizes[size], isLoading &&"animate-pulse")} />}
 {children}
 </Button>
 );
}

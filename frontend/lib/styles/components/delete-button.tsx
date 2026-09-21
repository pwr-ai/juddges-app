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
  type = "button",
  icon: Icon = Trash2,
  size = "md",
  isLoading = false,
}: DeleteButtonProps): React.JSX.Element {
  const sizeClasses = {
    sm: "text-xs h-8 px-3 rounded-none font-mono uppercase tracking-wider",
    md: "text-xs h-9 px-4 rounded-none font-mono uppercase tracking-wider",
    lg: "text-sm h-10 px-5 rounded-none font-mono uppercase tracking-wider",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5 mr-1.5",
    md: "h-4 w-4 mr-1.5",
    lg: "h-4 w-4 mr-2",
  };

  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      variant="destructive"
      className={cn(
        sizeClasses[size],
        "transition-colors duration-150",
        "bg-oxblood hover:bg-oxblood-deep text-parchment border-0 shadow-none font-medium",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-oxblood",
        isLoading && "opacity-50 cursor-wait",
        className
      )}
    >
      {Icon && <Icon className={cn(iconSizes[size], isLoading && "animate-pulse")} />}
      {children}
    </Button>
 );
}

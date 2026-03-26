/**
 * Text Button Component
 * Reusable text link style button component
 * Used for text link style actions like Back, Cancel, etc.
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for TextButton component
 */
export interface TextButtonProps {
  /** Button text/content */
  children: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Optional className for additional styling */
  className?: string;
  /** Optional disabled state */
  disabled?: boolean;
  /** Button type */
  type?: "button" | "submit" | "reset";
  /** Optional icon to display before text */
  icon?: React.ComponentType<{ className?: string }>;
  /** Icon position */
  iconPosition?: "left" | "right";
}

/**
 * Text Button Component
 *
 * A reusable text link style button component.
 * Minimal styling with text color changes and icon animations.
 *
 * @example
 * ```tsx
 * <TextButton onClick={() => handleClick()}>
 *   Back
 * </TextButton>
 * ```
 *
 * @example
 * ```tsx
 * <TextButton
 *   icon={ArrowLeft}
 *   iconPosition="left"
 * >
 *   Back
 * </TextButton>
 * ```
 */
export function TextButton({
  children,
  onClick,
  className,
  disabled = false,
  type = "button",
  icon: Icon,
  iconPosition = "left",
}: TextButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2",
        "text-sm font-medium",
        "text-muted-foreground hover:text-foreground",
        "active:opacity-80",
        "transition-colors duration-200",
        "group",
        // Focus state for accessibility
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {Icon && iconPosition === "left" && (
        <Icon className="h-4 w-4 group-hover:-translate-x-1 transition-transform duration-200" />
      )}
      <span>{children}</span>
      {Icon && iconPosition === "right" && (
        <Icon className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
      )}
    </button>
  );
}

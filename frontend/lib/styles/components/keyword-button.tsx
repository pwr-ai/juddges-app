/**
 * Keyword Button Component
 * Reusable button component for keywords, example queries, and similar clickable text elements
 * Similar styling to inactive filter toggle buttons but adapted for standalone use
 */

"use client";

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for KeywordButton component
 */
export interface KeywordButtonProps {
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
}

/**
 * Keyword Button Component
 *
 * A reusable button component for keywords, example queries, and similar elements.
 * Uses styling similar to inactive filter toggle buttons with neutral colors.
 *
 * @example
 * ```tsx
 * <KeywordButton onClick={() => handleClick()}>
 *   Swiss franc loans
 * </KeywordButton>
 * ```
 */
export function KeywordButton({
  children,
  onClick,
  className,
  disabled = false,
  type = "button",
}: KeywordButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative px-4 py-2 rounded-xl text-xs font-semibold",
        // Background gradient using semantic tokens
        "bg-gradient-to-br from-background via-background/80 to-muted/80",
        "backdrop-blur-md",
        // Border using semantic tokens
        "border border-border/50",
        "text-muted-foreground",
        // Shadow to match inactive toggle buttons
        "shadow-sm",
        "transition-[transform,shadow,border-color,background-color] duration-300 ease-out",
        // Hover effects with visible gradient
        "hover:bg-gradient-to-br hover:from-muted/50 hover:via-muted/80 hover:to-muted",
        "hover:text-foreground",
        "group-hover:border-border",
        "hover:shadow-md hover:shadow-primary/10",
        "hover:scale-[1.02] hover:-translate-y-0.5",
        "active:scale-100",
        "overflow-hidden",
        // Focus state for accessibility
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
      )}
    >

      {/* Hover overlay matching inactive filter toggle */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 pointer-events-none rounded-xl",
        "from-muted/50 via-muted/30 to-background/30"
      )} />

      {/* Shine effect on hover */}
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out rounded-xl -z-10 pointer-events-none" />

      <span className="relative z-10">{children}</span>
    </button>
  );
}

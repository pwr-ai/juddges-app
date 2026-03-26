/**
 * Plan Badge Component
 * Displays AI-Tax branding with PREVIEW badge
 * Clickable link to plans page
 */

"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PlanBadgeProps {
  /** Optional className for additional styling */
  className?: string;
  /** Callback when badge is clicked */
  onClick?: () => void;
  /** Text label to display (default: "AI-Tax") */
  label?: string;
  /** Size of the badge (default: "sm") */
  size?: "sm" | "lg";
  /** Custom text for the badge pill (default: "Preview") */
  badgeText?: string;
  /** Whether to hide the main label (default: false) */
  hideLabel?: boolean;
}

/**
 * Plan Badge Component
 *
 * A modern badge component that displays a label (default "AI-Tax") with a "PREVIEW" badge.
 * Clickable link that navigates to the plans page.
 *
 * @example
 * ```tsx
 * <PlanBadge onClick={() => handleClick()} />
 * <PlanBadge label="Demo Plan" />
 * <PlanBadge size="lg" />
 * ```
 */
export function PlanBadge({
  className,
  onClick,
  label = "AI-Tax",
  size = "sm",
  badgeText = "Preview",
  hideLabel = false,
}: PlanBadgeProps): React.JSX.Element {
  const isLarge = size === "lg";

  return (
    <Link
      href="/plans"
      onClick={onClick}
      className={cn(
        "flex items-center group rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        isLarge ? "gap-3" : "gap-2",
        className
      )}
    >
      {/* Brand/Plan Name with modern gradient */}
      {!hideLabel && (
        <span className={cn(
          "font-bold tracking-tight",
          "bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent",
          "transition-opacity duration-300 group-hover:opacity-80",
          isLarge ? "text-3xl md:text-4xl" : "text-sm"
        )}>
          {label}
        </span>
      )}

      {/* 2025-Style Badge - Ultra Compact */}
      <div className={cn(
        "relative rounded-full overflow-hidden flex items-center",
        "bg-primary/5 border border-primary/10",
        "backdrop-blur-md", // Glass effect
        "transition-all duration-300 ease-out",
        "group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-105",
        "shadow-[0_0_10px_-5px_rgba(var(--primary),0.2)]", // Subtle glow
        "group-hover:shadow-[0_0_15px_-3px_rgba(var(--primary),0.4)]", // Enhanced glow on hover
        isLarge ? "px-2.5 py-0.5" : "px-1.5 py-[1px]"
      )}>
        {/* Subtle shine effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <span className={cn(
          "relative font-bold uppercase tracking-wider text-primary/90 leading-none",
          isLarge ? "text-xs" : "text-[9px]"
        )}>
          {badgeText}
        </span>
      </div>
    </Link>
  );
}

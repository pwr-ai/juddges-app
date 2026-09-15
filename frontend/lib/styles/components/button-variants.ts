/**
 * Single source of truth for the button-variant styling (#144, #639).
 *
 * The variant components (AccentButton, GlassButton, …) draw from here.
 * Aligned with Editorial Jurisprudence:
 * - Primary: bg-oxblood text-parchment hover:bg-oxblood-deep
 * - Secondary: border-ink bg-card text-ink hover:bg-parchment-deep
 * - Free of glassmorphism, gradients, or non-editorial color tokens.
 */

import type { ClassValue } from "clsx";

import { cn } from "@/lib/utils";

// ── PrimaryButton ─────────────────────────────────────────────────────────
export type PrimaryButtonSize = "sm" | "md" | "lg" | "xl";

const primaryButtonSizes: Record<PrimaryButtonSize, string> = {
  sm: "h-9 px-6 rounded-md text-sm",
  md: "h-12 px-8 rounded-md text-base",
  lg: "h-14 px-10 rounded-md text-base",
  xl: "h-16 px-10 rounded-md text-base",
};

export function primaryButtonClassName(
  size: PrimaryButtonSize,
  isDisabled: boolean,
  isExtractionButton: boolean,
  className?: ClassValue,
): string {
  return cn(
    "group relative overflow-hidden inline-flex items-center justify-center",
    primaryButtonSizes[size],
    "font-semibold",
    "bg-oxblood text-parchment hover:bg-oxblood-deep",
    "shadow-sm hover:shadow-md",
    "transition-[color,background-color,border-color,box-shadow,transform]",
    "hover:-translate-y-px",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oxblood focus-visible:ring-offset-2",
    isDisabled && "opacity-70 cursor-not-allowed",
    isExtractionButton && [
      "border border-rule",
    ],
    className,
  );
}

// ── IconButton ────────────────────────────────────────────────────────────
export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "default" | "error" | "primary" | "muted";
export type IconButtonHoverStyle = "color" | "background";

export function iconButtonClassName(opts: {
  size: IconButtonSize;
  variant: IconButtonVariant;
  hoverStyle: IconButtonHoverStyle;
  compact: boolean;
  enhancedHover: boolean;
  enhancedFocus: boolean;
  enhancedActive: boolean;
  disableHover: boolean;
  disabled: boolean;
  className?: ClassValue;
}): string {
  const { size, variant, hoverStyle, compact, enhancedHover, enhancedFocus, enhancedActive, disableHover, disabled, className } = opts;

  const sizeClasses = {
    sm: compact ? "p-1 h-11 w-11" : "p-2 h-11 w-11",
    md: compact ? "p-1 h-11 w-11" : "p-1.5 h-11 w-11",
    lg: compact ? "p-1.5 h-11 w-11" : "p-2 h-12 w-12",
  };

  const baseVariantClasses = {
    default: "text-foreground",
    error: "text-destructive",
    primary: "text-primary",
    muted: "text-muted-foreground",
  };

  const getHoverClasses = (): string => {
    if (hoverStyle === "color") {
      const colorHoverClasses = {
        default: "hover:text-foreground",
        error: "hover:text-destructive",
        primary: "hover:text-primary",
        muted: "hover:text-foreground",
      };
      return colorHoverClasses[variant];
    } else {
      const backgroundHoverClasses = {
        default: "hover:bg-muted",
        error: "hover:bg-destructive/10 hover:text-destructive",
        primary: "hover:bg-primary/10",
        muted: "hover:bg-muted",
      };
      return backgroundHoverClasses[variant];
    }
  };

  const getEnhancedHoverClasses = (): string => {
    return "hover:bg-parchment-deep hover:text-ink hover:border hover:border-rule";
  };

  const classNameStr = typeof className === "string" ? className : "";
  const hasCustomHover = disableHover || classNameStr.includes("hover:");

  return cn(
    "rounded-md",
    "transition-[color,background-color,border-color,transform]",
    "flex items-center justify-center",
    "flex-shrink-0",
    "group",
    !classNameStr.includes("border") && "border-0",
    sizeClasses[size],
    baseVariantClasses[variant],
    !hasCustomHover && !enhancedHover && getHoverClasses(),
    !hasCustomHover && enhancedHover && getEnhancedHoverClasses(),
    !hasCustomHover && hoverStyle === "color" && "hover:bg-transparent hover:-translate-y-px",
    !hasCustomHover && !enhancedHover && hoverStyle === "background" && "hover:-translate-y-px",
    !hasCustomHover && enhancedHover && hoverStyle === "background" && "hover:-translate-y-px",
    !enhancedActive && "active:opacity-80",
    enhancedActive && "active:opacity-70 active:border active:border-primary/50",
    !enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );
}

// ── AccentButton ──────────────────────────────────────────────────────────
export const accentButtonSizes = {
  sm: "text-sm h-9 px-4 rounded-md",
  md: "text-sm h-10 px-5 rounded-md",
  lg: "text-base h-11 px-6 rounded-md",
} as const;

export const accentButtonBase =
  "transition-[color,background-color,border-color,box-shadow,transform] " +
  "border border-rule bg-gold-soft text-ink " +
  "hover:bg-gold-soft/80 hover:-translate-y-px " +
  "active:opacity-90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

// ── SecondaryButton ───────────────────────────────────────────────────────
export type SecondaryButtonSize = "sm" | "md" | "lg";

const secondaryButtonSizes: Record<SecondaryButtonSize, string> = {
  sm: "text-sm h-9 px-4 rounded-md",
  md: "text-sm h-10 px-5 rounded-md",
  lg: "text-base h-11 px-6 rounded-md",
};

export function secondaryButtonClassName(opts: {
  size: SecondaryButtonSize;
  enhancedHover: boolean;
  enhancedFocus: boolean;
  enhancedActive: boolean;
  className?: ClassValue;
}): string {
  const { size, enhancedHover, enhancedFocus, enhancedActive, className } = opts;
  return cn(
    secondaryButtonSizes[size],
    "inline-flex items-center justify-center",
    "transition-[color,background-color,border-color,box-shadow,transform]",
    "bg-card text-ink",
    "border border-ink",
    "shadow-sm",
    // Default hover
    !enhancedHover && "hover:bg-parchment-deep hover:-translate-y-px",
    // Enhanced hover
    enhancedHover && "hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood hover:-translate-y-px",
    // Active state
    !enhancedActive && "active:opacity-90",
    enhancedActive && "active:opacity-80 active:border-primary",
    "font-semibold",
    // Focus state
    !enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    className,
  );
}

// ── TextButton ────────────────────────────────────────────────────────────
export function textButtonClassName(
  disabled: boolean,
  className?: ClassValue,
): string {
  return cn(
    "flex items-center gap-2",
    "text-sm font-medium",
    "text-muted-foreground hover:text-foreground",
    "active:opacity-80",
    "transition-colors duration-200",
    "group",
    // Focus state for accessibility
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );
}

// ── GlassButton ───────────────────────────────────────────────────────────
export function glassButtonClassName(
  isWhite: boolean,
  className?: ClassValue,
): string {
  return cn(
    "w-full h-12 flex items-center justify-center gap-2",
    "rounded-md px-3 py-2.5 text-left outline-hidden transition-colors font-semibold",
    !isWhite && [
      "bg-card text-ink",
      "border border-rule",
      "shadow-xs",
      "[&>svg]:text-ink [&>svg]:stroke-[2]",
      "hover:bg-parchment-deep hover:border-rule-strong",
    ],
    isWhite && [
      "bg-card text-ink",
      "border border-rule",
      "shadow-xs",
      "[&>svg]:text-ink [&>svg]:stroke-[2]",
      "hover:bg-parchment-deep hover:border-rule-strong",
    ],
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
    className,
  );
}

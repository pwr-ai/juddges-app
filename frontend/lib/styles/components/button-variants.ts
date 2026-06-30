/**
 * Single source of truth for the button-variant styling (#144).
 *
 * The variant components (AccentButton, GlassButton, …) used to each carry
 * their own inlined Tailwind class blobs — three competing styling systems.
 * Those blobs now live here so every variant draws from one place. Each
 * `*ClassName` builder reproduces its component's exact `cn(...)` argument list
 * (same order, same conditionals), so the rendered class string — and therefore
 * the pixels — is unchanged (locked by button-classname-baseline.test.tsx).
 */

import type { ClassValue } from "clsx";

import { cn } from "@/lib/utils";
import { PRIMARY_GRADIENT, PRIMARY_GRADIENT_HOVER } from "@/lib/button-utils";

// ── PrimaryButton ─────────────────────────────────────────────────────────
export type PrimaryButtonSize = "sm" | "md" | "lg" | "xl";

const primaryButtonSizes: Record<PrimaryButtonSize, string> = {
  sm: "h-9 px-6 rounded-xl text-sm",
  md: "h-12 px-8 rounded-xl text-base",
  lg: "h-14 px-10 rounded-2xl text-base",
  xl: "h-16 px-10 rounded-2xl text-base",
};

export function primaryButtonClassName(
  size: PrimaryButtonSize,
  isDisabled: boolean,
  isExtractionButton: boolean,
  className?: ClassValue,
): string {
  return cn(
    PRIMARY_GRADIENT,
    PRIMARY_GRADIENT_HOVER,
    "group relative overflow-hidden inline-flex items-center justify-center",
    primaryButtonSizes[size],
    "font-semibold",
    "text-white",
    "shadow-lg hover:shadow-xl",
    "transition-all duration-300",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    isDisabled && "opacity-70 cursor-not-allowed",
    // Enhanced glassmorphism 2.0 for extraction buttons
    isExtractionButton && [
      "backdrop-blur-[40px] backdrop-saturate-[220%]",
      "bg-gradient-to-r from-blue-700/70 via-blue-600/70 to-indigo-700/70",
      "shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_8px_32px_rgba(30,58,138,0.2),0_4px_16px_rgba(30,58,138,0.15),inset_0_1px_0_rgba(255,255,255,1)]",
      "hover:from-blue-700/75 hover:via-blue-600/75 hover:to-indigo-700/75",
      "hover:shadow-[0_0_0_1px_rgba(255,255,255,1),0_8px_32px_rgba(30,58,138,0.25),0_4px_16px_rgba(30,58,138,0.2),inset_0_1px_0_rgba(255,255,255,1)]",
      "hover:-translate-y-0.5",
      "",
      "",
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
    if (variant === "primary") {
      return "hover:bg-primary/30 hover:shadow-xl hover:shadow-primary/50 hover:border hover:border-primary/60 hover:ring-2 hover:ring-primary/30";
    }
    return "hover:bg-primary/30 hover:shadow-xl hover:shadow-primary/50 hover:border hover:border-primary/60 hover:ring-2 hover:ring-primary/30";
  };

  const classNameStr = typeof className === "string" ? className : "";
  const hasCustomHover = disableHover || classNameStr.includes("hover: ");

  return cn(
    "rounded-lg",
    "transition-all duration-200",
    "flex items-center justify-center",
    "flex-shrink-0",
    "group",
    !classNameStr.includes("border") && "border-0",
    sizeClasses[size],
    baseVariantClasses[variant],
    !hasCustomHover && !enhancedHover && getHoverClasses(),
    !hasCustomHover && enhancedHover && getEnhancedHoverClasses(),
    !hasCustomHover && hoverStyle === "color" && "hover:scale-125 hover:bg-transparent",
    !hasCustomHover && !enhancedHover && hoverStyle === "background" && "hover:scale-110",
    !hasCustomHover && enhancedHover && hoverStyle === "background" && "hover:scale-115",
    !enhancedActive && "active:scale-[0.95] active:opacity-80",
    enhancedActive && "active:scale-[0.90] active:opacity-70",
    enhancedActive && "active:border active:border-primary/50",
    enhancedActive && "active:ring-2 active:ring-primary/30",
    !enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    enhancedFocus && "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
    enhancedFocus && "focus-visible:shadow-lg focus-visible:shadow-primary/50",
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );
}

// ── AccentButton ──────────────────────────────────────────────────────────
export const accentButtonSizes = {
  sm: "text-sm h-9 px-4 rounded-xl",
  md: "text-sm h-10 px-5 rounded-xl",
  lg: "text-base h-11 px-6 rounded-xl",
} as const;

export const accentButtonBase =
  "transition-all duration-300 " +
  "bg-gradient-to-r from-primary/10 via-blue-500/10 to-cyan-500/10 " +
  "border-primary/30 text-primary " +
  "hover:from-primary/15 hover:via-blue-500/15 hover:to-cyan-500/15 " +
  "hover:scale-105 hover:shadow-md " +
  "active:scale-[0.98] active:opacity-90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

// ── SecondaryButton ───────────────────────────────────────────────────────
export type SecondaryButtonSize = "sm" | "md" | "lg";

const secondaryButtonSizes: Record<SecondaryButtonSize, string> = {
  sm: "text-sm h-9 px-4 rounded-xl",
  md: "text-sm h-10 px-5 rounded-xl",
  lg: "text-base h-11 px-6 rounded-xl",
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
    "transition-all duration-300",
    // Glassmorphism 2.0 base styling
    "bg-white/70 backdrop-blur-xl backdrop-saturate-[200%]",
    "border border-white/80",
    "shadow-[0_4px_16px_rgba(15,23,42,0.08),0_0_20px_rgba(99,102,241,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]",
    "",
    // Default hover
    !enhancedHover && "hover:bg-white/85",
    !enhancedHover && "hover:scale-105 hover:shadow-[0_6px_20px_rgba(15,23,42,0.12),0_0_30px_rgba(99,102,241,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]",
    !enhancedHover && "hover:border-white/90",
    // Enhanced hover
    enhancedHover && "hover:bg-white",
    enhancedHover && "hover:border-primary/80",
    enhancedHover && "hover:shadow-[0_8px_32px_rgba(15,23,42,0.15),0_4px_16px_rgba(99,102,241,0.12),0_0_40px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,1)]",
    enhancedHover && "",
    enhancedHover && "hover:scale-[1.08] hover:-translate-y-1",
    enhancedHover && "hover:text-primary",
    enhancedHover && "hover:ring-2 hover:ring-primary/40",
    // Active state - default
    !enhancedActive && "active:scale-[0.98] active:opacity-90",
    // Enhanced active
    enhancedActive && "active:scale-[0.95] active:opacity-80",
    enhancedActive && "active:border-primary/50",
    enhancedActive && "active:ring-2 active:ring-primary/30",
    "font-semibold",
    // Focus state - default
    !enhancedFocus && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    // Enhanced focus
    enhancedFocus && "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-4",
    enhancedFocus && "focus-visible:border-primary/70",
    enhancedFocus && "focus-visible:shadow-lg focus-visible:shadow-primary/50",
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
    "rounded-[0.75rem] px-3 py-2.5 text-left outline-hidden transition-all duration-200 ease-out font-[600]",
    // Blue variant (default)
    !isWhite && [
      "bg-[rgba(37,99,235,0.15)]",
      "text-[#1E3A8A]",
      "border border-[rgba(37,99,235,0.40)]",
      "shadow-[0_0_0_1px_rgba(37,99,235,0.20)]",
      "[&>svg]:text-[#1E3A8A] [&>svg]:stroke-[2.5]",
      "hover:bg-[rgba(37,99,235,0.25)] hover: ",
      "hover:scale-[1.02] hover:shadow-[0_0_0_1px_rgba(37,99,235,0.30)] hover: ",
    ],
    // White variant
    isWhite && [
      "bg-[rgba(255,255,255,0.80)]",
      "text-[#475569]",
      "border border-white",
      "shadow-[0_1px_3px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]",
      "[&>svg]:text-[#475569] [&>svg]:stroke-[2.5]",
      "hover:bg-white hover: ",
      "hover:text-[#0F172A] hover: ",
      "hover:border-white hover: ",
      "hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.1)] hover: ",
      "[&>svg]:hover:text-[#0F172A]",
    ],
    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
    className,
  );
}

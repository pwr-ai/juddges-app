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

"use client";

// Re-export from standalone files (NOT from the barrel to avoid circular deps)
export { Header } from "./HeaderWithIcon";
export { SectionHeader } from "./section-header";
export { SecondaryHeader } from "./secondary-header";

/**
 * Get a gradient style class for headers based on size.
 */
export function getHeaderGradientStyle(size: "sm" | "md" | "lg" = "md"): string {
  const sizeClasses = {
    sm: "text-lg font-semibold",
    md: "text-xl font-bold",
    lg: "text-2xl font-bold",
  };

  return `${sizeClasses[size]} bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text`;
}

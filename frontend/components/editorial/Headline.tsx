import React from "react";
import { cn } from "@/lib/utils";

type HeadlineSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<HeadlineSize, string> = {
  xs: "text-2xl sm:text-3xl",
  sm: "text-3xl sm:text-4xl",
  md: "text-4xl sm:text-5xl",
  lg: "text-5xl sm:text-6xl lg:text-7xl",
  xl: "text-6xl sm:text-7xl lg:text-8xl",
};

interface HeadlineProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level. */
  as?: "h1" | "h2" | "h3" | "h4";
  /** Display size — defaults to `md`. */
  size?: HeadlineSize;
  /** Render in italic for editorial emphasis. */
  italic?: boolean;
  /** Color override — defaults to `ink`. */
  tone?: "ink" | "oxblood" | "ink-soft";
}

/**
 * Editorial headline — Instrument Serif with tight tracking and confident
 * leading. Use for hero headlines, section titles, and CTA banners. Supports
 * inline `<em>` styling that renders italic + oxblood.
 *
 * @example
 *   <Headline as="h1" size="lg">An open archive of <em>judicial reasoning</em></Headline>
 */
export function Headline({
  as: Tag = "h2",
  size = "md",
  italic = false,
  tone = "ink",
  className,
  children,
  ...props
}: HeadlineProps) {
  const toneClass =
    tone === "oxblood"
      ? "text-[color:var(--oxblood)]"
      : tone === "ink-soft"
        ? "text-[color:var(--ink-soft)]"
        : "text-[color:var(--ink)]";

  return (
    <Tag
      className={cn(
        "editorial-display",
        sizeClasses[size],
        italic && "italic",
        toneClass,
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default Headline;

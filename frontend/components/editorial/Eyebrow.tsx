import React from "react";
import { cn } from "@/lib/utils";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Hide the leading hairline rule. */
  noRule?: boolean;
  /** Tone — neutral ink-soft (default) or oxblood for emphasis. */
  tone?: "default" | "oxblood" | "gold";
  /** Render as <p> instead of <span> for block-level use. */
  as?: "span" | "p" | "div";
}

/**
 * Editorial eyebrow / kicker — small-caps mono label preceded by a hairline
 * rule. Used above headlines as a section label or category marker.
 *
 * @example
 *   <Eyebrow>About the Project</Eyebrow>
 *   <Eyebrow tone="oxblood">Database</Eyebrow>
 */
export function Eyebrow({
  noRule = false,
  tone = "default",
  as: Tag = "span",
  className,
  children,
  ...props
}: EyebrowProps) {
  const toneClass =
    tone === "oxblood"
      ? "text-[color:var(--oxblood)]"
      : tone === "gold"
        ? "text-[color:var(--gold)]"
        : "text-[color:var(--ink-soft)]";

  return (
    <Tag
      className={cn(
        noRule ? "inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em]" : "editorial-eyebrow",
        toneClass,
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default Eyebrow;

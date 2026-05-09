import React from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

interface SectionProps {
  /** Auto-numbered marker, e.g. `01`, `02`, … rendered as a watermark. */
  numeral?: string;
  /** Small-caps category kicker. */
  eyebrow?: string;
  /** Section title — may include `<em>` for italic-oxblood emphasis. */
  title: React.ReactNode;
  /**
   * Body lede rendered between the header and the section content. Rendered at
   * full `--ink` (not `--ink-soft`) so it stays AAA-readable on parchment for
   * long-form editorial dashboards.
   */
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Editorial dashboard section — wraps `SectionHeader` and content in a single
 * vertically-spaced block with the numeral as a watermark and a high-contrast
 * description lede. Used for any numbered editorial dashboard surface.
 *
 * @example
 *   <Section
 *     numeral="01"
 *     eyebrow="Overview"
 *     title="Key statistics"
 *     description="Snapshot across both jurisdictions."
 *   >
 *     <DualStatCardGrid ... />
 *   </Section>
 */
export function Section({
  numeral,
  eyebrow,
  title,
  description,
  className,
  children,
}: SectionProps) {
  return (
    <section className={cn("relative mb-16", className)}>
      <SectionHeader
        numeral={numeral}
        eyebrow={eyebrow}
        title={title}
        className={description ? "mb-3" : "mb-6"}
      />
      {description && (
        <p className="relative z-10 mb-7 max-w-3xl text-[17px] leading-[1.65] text-[color:var(--ink)]">
          {description}
        </p>
      )}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export default Section;

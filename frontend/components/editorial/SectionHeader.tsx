import React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";
import { Headline } from "./Headline";

interface SectionHeaderProps {
  eyebrow?: string;
  /** May contain `<em>` for italic-oxblood emphasis. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Auto-numbered marker, e.g. `01`, `02`, … rendered as a watermark. */
  numeral?: string;
  /** Alignment — `start` (default) or `center`. */
  align?: "start" | "center";
  /** Optional right-side action (e.g. CTA link). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Editorial section header — eyebrow + serif title + description, with a
 * giant marginal numeral as an optional decorative element. Drop this in at
 * the top of every long-form section for visual rhythm.
 *
 * @example
 *   <SectionHeader
 *     eyebrow="Capabilities"
 *     numeral="03"
 *     title={<>Three ways to <em>work with</em> legal data</>}
 *     description="Search, analyze, and extract structured information."
 *   />
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  numeral,
  align = "start",
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "relative",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-3xl",
        action && "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      {numeral && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -z-0 select-none font-serif italic text-[color:var(--gold-soft)]",
            "text-[8rem] sm:text-[10rem] leading-none opacity-60",
            align === "center" ? "left-1/2 -top-12 -translate-x-1/2" : "-left-2 -top-10",
          )}
        >
          {numeral}
        </span>
      )}
      <div className="relative z-10 flex flex-col gap-4">
        {eyebrow && (
          <Eyebrow as="span" tone="oxblood">
            {eyebrow}
          </Eyebrow>
        )}
        <Headline as="h2" size="md">
          {title}
        </Headline>
        {description && (
          <p className="max-w-2xl text-[17px] leading-[1.65] text-[color:var(--ink-soft)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}

export default SectionHeader;

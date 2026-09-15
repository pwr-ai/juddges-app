import React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";
import { Headline } from "./Headline";

interface SectionHeaderProps {
  eyebrow?: string;
  /** May contain `<em>` for red emphasis. */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Section number, e.g. `01`, `02`, … rendered as a PWr red square. */
  numeral?: string;
  /** Alignment — `start` (default) or `center`. */
  align?: "start" | "center";
  /** `bar` wraps eyebrow + title in the SIW red header bar. */
  variant?: "default" | "bar";
  /** Optional right-side action (e.g. CTA link). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Editorial section header — eyebrow + display title + description, with an
 * optional section number rendered as the SIW red square (the identity
 * system's page-number block). `variant="bar"` turns the header into the
 * full red bar used on SIW document pages.
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
  variant = "default",
  action,
  className,
}: SectionHeaderProps) {
  const numeralBlock = numeral && (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center bg-pwr-red font-display text-sm leading-none text-pwr-paper",
        align === "center" && "mx-auto",
      )}
    >
      {numeral}
    </span>
  );

  const heading = (
    <Headline as="h2" size="md" className={variant === "bar" ? "text-pwr-paper" : undefined}>
      {title}
    </Headline>
  );

  return (
    <div
      className={cn(
        "relative",
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-3xl",
        action && "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="relative z-10 flex flex-col gap-4">
        {variant === "bar" ? (
          <div className="pwr-bar flex flex-col gap-2 py-4">
            {eyebrow && (
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-pwr-sand">
                {eyebrow}
              </span>
            )}
            <div className="flex items-start gap-3">
              {numeralBlock}
              {heading}
            </div>
          </div>
        ) : (
          <>
            {numeralBlock}
            {eyebrow && (
              <Eyebrow as="span" tone="oxblood">
                {eyebrow}
              </Eyebrow>
            )}
            {heading}
          </>
        )}
        {description && (
          <p className="max-w-2xl text-[17px] leading-[1.65] text-pwr-grey">
            {description}
          </p>
        )}
      </div>
      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}

export default SectionHeader;

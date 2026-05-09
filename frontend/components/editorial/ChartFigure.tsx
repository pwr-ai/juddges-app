import React from "react";
import { cn } from "@/lib/utils";

interface ChartFigureProps {
  /** Figure number — rendered in the eyebrow as "FIG. nn" with gold tone. */
  figure?: string;
  /** Section / topic kicker shown after the figure number. */
  eyebrow?: React.ReactNode;
  /** Serif chart title — replaces any Plotly inline title. */
  title?: React.ReactNode;
  /** Optional caption shown beneath the chart, above the source line. */
  caption?: React.ReactNode;
  /** Optional source / dataset attribution rendered in mono small caps. */
  source?: React.ReactNode;
  /** Add an oxblood top mark for the page-featured figure. */
  featured?: boolean;
  className?: string;
  /** The chart itself — a `<Plot/>`, SVG, or hand-rolled markup. */
  children: React.ReactNode;
}

/**
 * Editorial chart figure — sharp-edged paper card with a hairline ink rule
 * across the top, a "FIG. nn — eyebrow" line, a serif title, the chart body,
 * and a caption + source line below. Drop-in for any chart on the platform
 * (Plotly, Recharts, hand-rolled SVG).
 *
 * Pairs with `lib/charts/editorial-plot.ts` for Plotly layout + palette.
 *
 * @example
 *   <ChartFigure
 *     figure="01"
 *     eyebrow="Temporal"
 *     title="Judgments per year"
 *     caption="UK coverage spans 2003–2024; the Polish corpus begins in 2012."
 *     source="6,050 UK + 6,050 PL judgments"
 *     featured
 *   >
 *     <Plot ... />
 *   </ChartFigure>
 */
export function ChartFigure({
  figure,
  eyebrow,
  title,
  caption,
  source,
  featured = false,
  className,
  children,
}: ChartFigureProps) {
  const hasHeader = figure || eyebrow || title;
  const hasFooter = caption || source;

  return (
    <figure
      className={cn(
        "editorial-card relative flex flex-col p-5 sm:p-6",
        className,
      )}
    >
      {featured && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-px left-0 h-[2px] w-12 bg-[color:var(--oxblood)]"
        />
      )}
      {hasHeader && (
        <header className="mb-4">
          {(figure || eyebrow) && (
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink)]">
              {figure && (
                <span className="text-[color:var(--gold)]">FIG.&nbsp;{figure}</span>
              )}
              {figure && eyebrow && (
                <span className="mx-2 text-[color:var(--rule-strong)]">·</span>
              )}
              {eyebrow}
            </span>
          )}
          {title && (
            <h3 className="mt-1.5 font-serif text-xl sm:text-2xl leading-[1.1] tracking-[-0.01em] text-[color:var(--ink)]">
              {title}
            </h3>
          )}
        </header>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
      {hasFooter && (
        <figcaption className="mt-5 border-t-2 border-[color:var(--ink)] pt-4">
          {caption && (
            <p className="text-[15px] leading-[1.65] text-[color:var(--ink)]">
              {caption}
            </p>
          )}
          {source && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink)]">
              <span className="text-[color:var(--gold)]">Source&nbsp;·&nbsp;</span>
              {source}
            </p>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export default ChartFigure;

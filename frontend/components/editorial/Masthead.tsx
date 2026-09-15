import React from "react";
import { cn } from "@/lib/utils";

interface MastheadProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Left tag — small caps, e.g. "EST. 2024 · WROCLAW". */
  badge?: React.ReactNode;
  /** Volume / issue / version label rendered on the right, in PWr sand. */
  meta?: React.ReactNode;
  /** Draw the SIW nameplate underline beneath the bar. */
  ruled?: boolean;
}

/**
 * Editorial masthead — the SIW red header bar: PWr red block, white
 * small-caps text, sand meta on the right, and the horizontal underline the
 * identity system places under the university wordmark.
 *
 * @example
 *   <Masthead badge="Est. 2024 · Wroclaw" meta="VOL I · NO 1" ruled />
 */
export function Masthead({
  badge,
  meta,
  ruled = true,
  className,
  ...props
}: MastheadProps) {
  return (
    <div
      className={cn(
        "pwr-bar flex items-center justify-between gap-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em]",
        ruled && "border-b border-pwr-black",
        className,
      )}
      {...props}
    >
      {badge && <span>{badge}</span>}
      {meta && <span className="text-pwr-sand">{meta}</span>}
    </div>
  );
}

export default Masthead;

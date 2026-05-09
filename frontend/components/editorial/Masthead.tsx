import React from "react";
import { cn } from "@/lib/utils";

interface MastheadProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Top tag — small caps, e.g. "EST. 2024 · WROCLAW". */
  badge?: React.ReactNode;
  /** Volume / issue / version label rendered on the right. */
  meta?: React.ReactNode;
  /** Add a heavy bottom rule. */
  ruled?: boolean;
}

/**
 * Editorial masthead — used at the top of the landing hero to evoke a
 * legal periodical's nameplate. Two small rows separated by a strong rule.
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
        "flex items-center justify-between gap-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]",
        ruled && "border-b border-[color:var(--ink)]",
        className,
      )}
      {...props}
    >
      {badge && <span>{badge}</span>}
      {meta && <span className="text-[color:var(--oxblood)]">{meta}</span>}
    </div>
  );
}

export default Masthead;

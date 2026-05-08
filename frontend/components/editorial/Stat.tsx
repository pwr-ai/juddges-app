"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatProps {
  /** Numeric value to render. Will be auto-formatted (47K, 1.2M). */
  value: number;
  /** Optional suffix (`+`, `%`, etc). */
  suffix?: string;
  /** Bottom label. */
  label: string;
  /** Optional fine-print detail underneath the label. */
  detail?: string;
  /** Render as a static value (no animation). */
  static?: boolean;
  /** Display size of the figure. */
  size?: "sm" | "md" | "lg";
  /** Loading skeleton state. */
  loading?: boolean;
  /** Optional citation-style superscript marker (¹, ², …). */
  marker?: string;
  className?: string;
}

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000).toLocaleString()}K`;
  return n.toLocaleString();
}

/**
 * Editorial stat figure — large serif numeral with a tabular feel,
 * label below, optional detail line, optional citation marker.
 * Animates from 0 → value when first scrolled into view.
 */
export function Stat({
  value,
  suffix = "",
  label,
  detail,
  static: isStatic = false,
  size = "md",
  loading = false,
  marker,
  className,
}: StatProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(() => formatStat(value));

  useEffect(() => {
    if (isStatic || value === 0) {
      setDisplay(formatStat(value));
      return;
    }
    if (!inView) {
      setDisplay(formatStat(value));
      return;
    }

    let cancelled = false;
    const duration = 1800;
    const start = performance.now();

    function tick(now: number) {
      if (cancelled) return;
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * value);
      setDisplay(formatStat(current));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [inView, value, isStatic]);

  const figureSize = {
    sm: "text-3xl sm:text-4xl",
    md: "text-4xl sm:text-5xl lg:text-6xl",
    lg: "text-5xl sm:text-6xl lg:text-7xl",
  }[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <span
        ref={ref}
        className={cn(
          "editorial-numeral leading-[0.95]",
          figureSize,
        )}
      >
        {loading ? (
          <span className="inline-block h-[1em] w-24 animate-pulse rounded-sm bg-[color:var(--rule)]/60" />
        ) : (
          <>
            {marker && <sup className="editorial-citation mr-1">{marker}</sup>}
            {display}
            {suffix && <span className="text-[color:var(--oxblood)]">{suffix}</span>}
          </>
        )}
      </span>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
        {label}
      </span>
      {detail && (
        <span className="text-sm text-[color:var(--ink-soft)] leading-snug">
          {detail}
        </span>
      )}
    </motion.div>
  );
}

export default Stat;

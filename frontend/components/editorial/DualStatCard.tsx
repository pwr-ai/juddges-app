import React from "react";
import { cn } from "@/lib/utils";

interface DualStatCardProps {
  /** Small-caps mono label rendered above the values. */
  label: string;
  /** UK / left-side value — numbers are locale-formatted, strings pass through. */
  ukValue: string | number;
  /** PL / right-side value. */
  plValue: string | number;
  /** Optional unit suffix appended to both values (e.g. `" words"`). */
  format?: string;
  /** Optional override for the left-column label (default: `UK`). */
  leftLabel?: string;
  /** Optional override for the right-column label (default: `PL`). */
  rightLabel?: string;
  className?: string;
}

/**
 * Editorial bilateral KPI card — two values side-by-side with a hairline
 * vertical divider, ink-on-left and oxblood-on-right tonal split. Numbers are
 * shown in full (no K-rounding); pass pre-rounded numbers if compaction is
 * desired. Used wherever a stats page compares two jurisdictions or sources.
 *
 * @example
 *   <DualStatCard label="Total Judgments" ukValue={6050} plValue={6050} />
 *   <DualStatCard label="Avg. Sentence Length" ukValue={18.2} plValue={22.7} format=" words" />
 */
export function DualStatCard({
  label,
  ukValue,
  plValue,
  format,
  leftLabel = "UK",
  rightLabel = "PL",
  className,
}: DualStatCardProps) {
  const fmt = (v: string | number) =>
    typeof v === "number" ? v.toLocaleString() : v;

  return (
    <div className={cn("editorial-card flex flex-col p-4", className)}>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
        {label}
      </p>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            {leftLabel}
          </span>
          <span className="editorial-numeral text-2xl text-[color:var(--ink)] leading-none">
            {fmt(ukValue)}
            {format}
          </span>
        </div>
        <span aria-hidden className="self-stretch w-px bg-[color:var(--rule)]" />
        <div className="flex flex-col items-end text-right">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--oxblood)]">
            {rightLabel}
          </span>
          <span className="editorial-numeral text-2xl text-[color:var(--oxblood)] leading-none">
            {fmt(plValue)}
            {format}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DualStatCard;

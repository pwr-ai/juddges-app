"use client";
import React from "react";
import type { BaseFilterValue, BaseNumericRange } from "@/lib/store/searchStore";

function dateToEpochSeconds(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}
function epochSecondsToDate(s: number | undefined): string {
  if (typeof s !== "number") return "";
  const d = new Date(s * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export interface DateRangeControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "date_range" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "date_range" }> | undefined) => void;
  disabled?: boolean;
}

export function DateRangeControl({
  label, description, value, onChange, disabled,
}: DateRangeControlProps) {
  const range = value?.range ?? {};
  const emit = (side: "min" | "max", iso: string) => {
    const next: BaseNumericRange = { ...range, [side]: dateToEpochSeconds(iso) };
    if (next.min === undefined && next.max === undefined) onChange(undefined);
    else onChange({ kind: "date_range", range: next });
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">{label}</label>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date" disabled={disabled}
          value={epochSecondsToDate(range.min)}
          aria-label={`${label} minimum`}
          onChange={(e) => emit("min", e.target.value)}
          className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
        />
        <span className="text-[color:var(--ink-soft)]">–</span>
        <input
          type="date" disabled={disabled}
          value={epochSecondsToDate(range.max)}
          aria-label={`${label} maximum`}
          onChange={(e) => emit("max", e.target.value)}
          className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
        />
      </div>
    </div>
  );
}

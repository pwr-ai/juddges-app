"use client";
import React from "react";
import type { BaseFilterValue, BaseNumericRange } from "@/lib/store/searchStore";

export interface NumericRangeControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
}

function parseBound(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function NumericRangeControl({
  label, description, value, onChange, min, step, disabled,
}: NumericRangeControlProps) {
  const range = value?.range ?? {};
  const emit = (side: "min" | "max", raw: string) => {
    const next: BaseNumericRange = { ...range, [side]: parseBound(raw) };
    if (next.min === undefined && next.max === undefined) onChange(undefined);
    else onChange({ kind: "numeric_range", range: next });
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">{label}</label>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} step={step}
          value={range.min ?? ""} disabled={disabled}
          aria-label={`${label} minimum`}
          onChange={(e) => emit("min", e.target.value)}
          className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
        />
        <span className="text-[color:var(--ink-soft)]">–</span>
        <input
          type="number" min={min} step={step}
          value={range.max ?? ""} disabled={disabled}
          aria-label={`${label} maximum`}
          onChange={(e) => emit("max", e.target.value)}
          className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
        />
      </div>
    </div>
  );
}

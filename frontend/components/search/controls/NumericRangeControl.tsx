"use client";
import React from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { BaseFilterValue, BaseNumericRange } from "@/lib/store/searchStore";
import { Slider } from "@/components/ui/slider";
import { useNumericHistogram } from "@/lib/extractions/base-schema-filter-api";

export interface NumericRangeControlProps {
  label: string;
  description?: string;
  value: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined;
  onChange: (next: Extract<BaseFilterValue, { kind: "numeric_range" }> | undefined) => void;
  /** Registry field key — drives the distribution-histogram fetch (issue #140). */
  field?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
}

function parseBound(raw: string): number | undefined {
  if (raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Round a bucket edge for compact display (integers stay integers). */
function fmtEdge(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const CHART_HEIGHT = 56;

export function NumericRangeControl({
  label, description, value, onChange, field, min, step, disabled,
}: NumericRangeControlProps) {
  const range = value?.range ?? {};

  const emit = (next: BaseNumericRange) => {
    if (next.min === undefined && next.max === undefined) onChange(undefined);
    else onChange({ kind: "numeric_range", range: next });
  };

  const emitSide = (side: "min" | "max", raw: string) => {
    emit({ ...range, [side]: parseBound(raw) });
  };

  // -------------------------------------------------------------------------
  // Distribution histogram (cached 1h). Only fetched when a field is provided.
  // -------------------------------------------------------------------------
  const histogram = useNumericHistogram(field ?? null, 20, Boolean(field));
  const buckets = React.useMemo(
    () => histogram.data?.buckets ?? [],
    [histogram.data],
  );

  const domainMin = buckets.length > 0 ? buckets[0].bucket_lo : 0;
  const domainMax =
    buckets.length > 0 ? buckets[buckets.length - 1].bucket_hi : 1;
  const hasDomain = buckets.length > 0 && domainMax > domainMin;

  const sliderStep = React.useMemo(() => {
    if (step) return step;
    const allInts = buckets.every(
      (b) => Number.isInteger(b.bucket_lo) && Number.isInteger(b.bucket_hi),
    );
    if (buckets.length > 0 && allInts && domainMax - domainMin <= 1000) return 1;
    const span = domainMax - domainMin;
    return span > 0 ? span / 200 : 1;
  }, [step, buckets, domainMin, domainMax]);

  // Clamp the active filter into the domain for the slider position.
  const lo = range.min ?? domainMin;
  const hi = range.max ?? domainMax;
  const sliderValue: [number, number] = [
    Math.max(domainMin, Math.min(lo, domainMax)),
    Math.max(domainMin, Math.min(hi, domainMax)),
  ];

  const onSlider = (next: number[]) => {
    const [nMin, nMax] = next;
    // Drop bounds equal to the domain extent so a full-span selection clears.
    emit({
      min: nMin > domainMin ? nMin : undefined,
      max: nMax < domainMax ? nMax : undefined,
    });
  };

  const chartData = buckets.map((b) => {
    const mid = (b.bucket_lo + b.bucket_hi) / 2;
    return {
      label: `${fmtEdge(b.bucket_lo)}–${fmtEdge(b.bucket_hi)}`,
      count: b.count,
      inRange: mid >= sliderValue[0] && mid <= sliderValue[1],
    };
  });

  const inputClass =
    "w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50";

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">{label}</label>
      {description && (
        <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">{description}</div>
      )}

      {/* Distribution histogram — purely informational, hidden from a11y tree */}
      {field && (histogram.isLoading || chartData.length > 0) && (
        <div className="mb-1" style={{ height: CHART_HEIGHT }} aria-hidden="true">
          {histogram.isLoading ? (
            <div className="flex h-full items-center justify-center text-[11px] text-[color:var(--ink-soft)]">
              Loading distribution…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                barCategoryGap={1}
              >
                <Tooltip
                  cursor={{ fill: "var(--gold-soft)", opacity: 0.4 }}
                  contentStyle={{
                    backgroundColor: "var(--parchment)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: "4px",
                    fontSize: "11px",
                    padding: "2px 6px",
                  }}
                  labelStyle={{ color: "var(--ink-soft)" }}
                  itemStyle={{ color: "var(--ink)" }}
                  formatter={(val) => [`${Number(val ?? 0).toLocaleString()} cases`, ""]}
                  separator=""
                />
                <Bar dataKey="count" isAnimationActive={false}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.inRange ? "var(--oxblood)" : "var(--rule)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Range slider — overlays the histogram domain */}
      {field && hasDomain && (
        <Slider
          value={sliderValue}
          min={domainMin}
          max={domainMax}
          step={sliderStep}
          onValueChange={onSlider}
          disabled={disabled}
          aria-label={`${label} range`}
          className="mb-2"
        />
      )}

      {/* Min/max number inputs — a11y fallback, kept in sync with the slider */}
      <div className="flex items-center gap-2">
        <input
          type="number" min={min} step={step}
          value={range.min ?? ""} disabled={disabled}
          aria-label={`${label} minimum`}
          onChange={(e) => emitSide("min", e.target.value)}
          className={inputClass}
        />
        <span className="text-[color:var(--ink-soft)]">–</span>
        <input
          type="number" min={min} step={step}
          value={range.max ?? ""} disabled={disabled}
          aria-label={`${label} maximum`}
          onChange={(e) => emitSide("max", e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

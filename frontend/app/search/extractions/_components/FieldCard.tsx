"use client";

import { HorizontalBarChart } from "@/components/charts";
import { useTranslation } from "@/contexts/LanguageContext";
import { aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import type { FieldAggregate } from "@/types/base-schema-filter";

const BAR = "#9A342D"; // --pwr-red
const MUTED = "#5A5A5A"; // --pwr-grey — other / missing

export interface FieldCardProps {
  field: string;
  aggregate: FieldAggregate;
  sampleN: number;
  yAxis: "count" | "percent";
  onBarClick?: (field: string, value: string) => void;
  onRemove?: (field: string) => void;
}

interface Row {
  name: string;
  count: number;
  value: string | null; // null = synthetic other/missing row (not clickable)
  color: string;
}

function rowsFor(agg: FieldAggregate, other: string, missing: string): Row[] {
  const rows: Row[] = [];
  if (agg.kind === "numeric") {
    for (const b of agg.buckets) rows.push({ name: `${b.lo}–${b.hi}`, count: b.count, value: null, color: BAR });
  } else {
    for (const v of agg.values) rows.push({ name: v.value, count: v.count, value: v.value, color: BAR });
    if (agg.kind === "categorical" && agg.other > 0) rows.push({ name: other, count: agg.other, value: null, color: MUTED });
  }
  if (agg.null > 0) rows.push({ name: missing, count: agg.null, value: null, color: MUTED });
  return rows;
}

/** One field's distribution over the sample (#708). Single series, single hue. */
export function FieldCard({ field, aggregate, sampleN, yAxis, onBarClick, onRemove }: FieldCardProps) {
  const { t } = useTranslation();
  const rows = rowsFor(aggregate, t("extraction.statsOther"), t("extraction.statsMissing"));
  const items = rows.map((r) => ({
    name: r.name,
    count: yAxis === "percent" && sampleN > 0 ? Math.round((r.count / sampleN) * 1000) / 10 : r.count,
  }));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const isModelScore = field.startsWith("deep_");
  return (
    <section className="border border-[color:var(--rule)] bg-white p-4" aria-label={aggregateFieldLabel(field)}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-base text-[color:var(--ink)]">{aggregateFieldLabel(field)}</h3>
          <p className="font-mono text-[11px] text-[color:var(--ink-soft)]">
            {aggregate.covered.toLocaleString("en-US")} / {sampleN.toLocaleString("en-US")}
            {isModelScore && ` · ${t("extraction.statsModelScore")}`}
          </p>
        </div>
        {onRemove && (
          <button type="button" onClick={() => onRemove(field)} className="font-mono text-[11px] text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]">
            {t("extraction.statsRemoveField")}
          </button>
        )}
      </header>
      <HorizontalBarChart
        items={items}
        color={BAR}
        colors={rows.map((r) => r.color)}
        showCounts
        height={Math.max(160, 28 * items.length + 60)}
        xAxisTitle={yAxis === "percent" ? t("extraction.statsYAxisPercent") : t("extraction.statsYAxisCount")}
        onBarClick={(name) => {
          const row = byName.get(name);
          if (row?.value !== null && row?.value !== undefined && onBarClick) onBarClick(field, row.value);
        }}
      />
      {aggregate.kind === "categorical" && aggregate.multi && (
        <p className="mt-1 font-mono text-[11px] text-[color:var(--ink-soft)]">{t("extraction.statsMultiNote")}</p>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { EditorialButton } from "@/components/editorial";
import { useTranslation } from "@/contexts/LanguageContext";
import { useDashboardStats } from "@/lib/api/dashboard";
import { AGGREGABLE_FIELDS, aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import { useExtractionAggregate } from "@/lib/extractions/base-schema-filter-api";
import { ALL_FILTER_FIELD_BY_NAME } from "@/lib/extractions/base-schema-filter-config";
import { aggregateToCsv, buildCohortDefinition } from "@/lib/extractions/stats-export";
import { ErrorCard } from "@/lib/styles/components";
import type { AggregateRequest, BaseSchemaFilters } from "@/types/base-schema-filter";

import { FieldCard } from "./FieldCard";
import { ScaleSlider } from "./ScaleSlider";

export interface StatisticsViewProps {
  filters: BaseSchemaFilters;
  textQuery: string;
  sampleSize: number | undefined;
  seed: number;
  fields: string[];
  onSampling: (n: number | undefined) => void;
  onReshuffle: () => void;
  onFields: (fields: string[]) => void;
  /** Switch to the list; with a patch, merge it into the filters first (drill-back). */
  onDrillBack: (patch?: Partial<BaseSchemaFilters>) => void;
}

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Drill-back patch for a clicked bar, or `null` when the field has no
 * filter predicate the value can be turned into (core fields like
 * `court_name`, numeric/year/date fields). Only enum/tag arrays and the
 * tri-state booleans map cleanly from a bar value onto `BaseSchemaFilters`.
 *
 * Array filters REPLACE any existing value for the field: the RPC applies
 * them as any-of (`&&` / `= ANY`), so appending would widen the cohort
 * instead of narrowing it to the clicked bar.
 */
function drillBackPatch(field: string, value: string): Partial<BaseSchemaFilters> | null {
  const control = ALL_FILTER_FIELD_BY_NAME[field]?.control;
  if (control === "enum_multi" || control === "tag_array") {
    return { [field]: [value] } as Partial<BaseSchemaFilters>;
  }
  if (control === "boolean_tri") {
    return { [field]: value === "true" } as Partial<BaseSchemaFilters>;
  }
  return null;
}

function isDrillable(field: string): boolean {
  const control = ALL_FILTER_FIELD_BY_NAME[field]?.control;
  return control === "enum_multi" || control === "tag_array" || control === "boolean_tri";
}

/** Trailing debounce; starts at the current value so mount sends one request. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Statistics body of /search/extractions (#708, spec §5.2). */
export function StatisticsView(props: StatisticsViewProps) {
  const { filters, textQuery, sampleSize, seed, fields, onSampling, onReshuffle, onFields, onDrillBack } = props;
  const { t } = useTranslation();
  const [yAxis, setYAxis] = useState<"count" | "percent">("count");
  const { data: stats } = useDashboardStats();
  const corpusTotal = typeof stats?.total_judgments === "number" ? stats.total_judgments : null;

  // Only the free-text query is debounced: it changes per keystroke, while
  // filters, fields, sampling and seed are discrete choices sent at once.
  const debouncedQuery = useDebouncedValue(textQuery.trim(), 300);
  const request = useMemo<AggregateRequest>(
    () => ({
      filters,
      ...(debouncedQuery !== "" ? { text_query: debouncedQuery } : {}),
      fields,
      ...(sampleSize !== undefined ? { sample_size: sampleSize, seed } : {}),
    }),
    [filters, debouncedQuery, fields, sampleSize, seed],
  );
  const { data, isLoading, isFetching, error, refetch } = useExtractionAggregate(request);

  const addValue = (field: string, value: string) => {
    const patch = drillBackPatch(field, value);
    if (patch) onDrillBack(patch);
  };

  // Mounted in the error state too, so a failed sample can be resized (#708 review).
  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ScaleSlider cohortTotal={data?.total ?? Number.POSITIVE_INFINITY} sampleSize={sampleSize} seed={seed} onChange={onSampling} onReshuffle={onReshuffle} />
      <div role="radiogroup" aria-label={t("extraction.statsYAxis")} className="inline-flex border border-[color:var(--rule)] font-mono text-xs">
        {(["count", "percent"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={yAxis === v} onClick={() => setYAxis(v)}
            className={yAxis === v ? "bg-[color:var(--ink)] px-2 py-1 text-[color:var(--parchment)]" : "px-2 py-1 text-[color:var(--ink-soft)]"}>
            {v === "count" ? t("extraction.statsYAxisCount") : t("extraction.statsYAxisPercent")}
          </button>
        ))}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-4" aria-busy={isFetching}>
        {controls}
        <div role="alert">
          <ErrorCard message={t("extraction.statsError")} onRetry={() => void refetch()} retryLabel={t("common.retry")} />
        </div>
      </div>
    );
  }
  if (!data && isLoading) {
    return (
      <p role="status" aria-label={t("common.loading")} className="py-8 font-mono text-xs text-[color:var(--ink-soft)]">
        …
      </p>
    );
  }
  if (!data) return null;
  if (data.total === 0) {
    return <p className="py-8 text-sm text-[color:var(--ink-soft)]">{t("extraction.statsEmpty")}</p>;
  }

  const sampled = data.sample_n < data.total;
  const addable = AGGREGABLE_FIELDS.filter((f) => !fields.includes(f));

  return (
    <div className="space-y-4" aria-busy={isFetching}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--rule)] py-2 text-sm">
        <p className="text-[color:var(--ink-soft)]">
          {corpusTotal === null
            ? t("extraction.statsCohortLineNoCorpus", { matched: data.total.toLocaleString("en-US") })
            : t("extraction.statsCohortLine", { matched: data.total.toLocaleString("en-US"), corpus: corpusTotal.toLocaleString("en-US") })}
          {sampled && ` · ${t("extraction.statsSampleLine", { n: data.sample_n.toLocaleString("en-US"), seed: String(data.seed ?? "") })}`}
          {isFetching && ` ${t("extraction.statsUpdating")}`}
        </p>
        <button type="button" onClick={() => onDrillBack(undefined)} className="font-mono text-xs underline hover:text-[color:var(--ink)]">
          {t("extraction.statsShowJudgments")}
        </button>
      </div>

      {controls}

      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) =>
          data.fields[field] ? (
            <FieldCard key={field} field={field} aggregate={data.fields[field]} sampleN={data.sample_n} yAxis={yAxis}
              onBarClick={isDrillable(field) ? addValue : undefined}
              onRemove={fields.length > 1 ? (f) => onFields(fields.filter((x) => x !== f)) : undefined} />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] pt-3">
        <label className="font-mono text-xs text-[color:var(--ink-soft)]">
          {t("extraction.statsAddField")}{" "}
          <select className="border border-[color:var(--rule)] bg-[color:var(--parchment)] px-2 py-1" value="" onChange={(e) => e.target.value && onFields([...fields, e.target.value])}>
            <option value="">—</option>
            {addable.map((f) => (
              <option key={f} value={f}>{aggregateFieldLabel(f)}</option>
            ))}
          </select>
        </label>
        <EditorialButton variant="secondary" onClick={() => download("statistics.csv", "text/csv", aggregateToCsv(data, aggregateFieldLabel, fields))}>
          {t("extraction.statsExportCsv")}
        </EditorialButton>
        <EditorialButton variant="secondary"
          onClick={() => download("cohort.json", "application/json", JSON.stringify(buildCohortDefinition({ filters, textQuery, response: data, fields, corpusTotal }), null, 2))}>
          {t("extraction.statsExportCohort")}
        </EditorialButton>
      </div>
    </div>
  );
}

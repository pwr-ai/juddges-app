"use client";

import { useMemo, useState } from "react";

import { useTranslation } from "@/contexts/LanguageContext";
import { aggregateFieldLabel } from "@/lib/extractions/aggregate-fields";
import type { PrecedentCohortItem } from "@/lib/api/advanced";
import {
  COHORT_GROUP_FIELDS,
  type CohortGroupField,
  groupCohort,
  topBucket,
} from "@/lib/precedents/cohort-grouping";
import { FieldCard } from "@/app/search/extractions/_components/FieldCard";

export interface CohortFilter {
  field: CohortGroupField;
  value: string;
}

export interface CohortInsightsProps {
  cohort: PrecedentCohortItem[];
  filter: CohortFilter | null;
  /** How many of the ranked precedents survive the active filter. */
  filteredRankedCount: number;
  onFilterChange: (filter: CohortFilter | null) => void;
}

/**
 * "In similar cases…" — the Explore chart over a similarity cohort instead of a
 * filter cohort (spec §7.2). Grouping is client-side; the backend only supplies
 * the raw candidates.
 */
export function CohortInsights({
  cohort,
  filter,
  filteredRankedCount,
  onFilterChange,
}: CohortInsightsProps) {
  const { t } = useTranslation();
  const [field, setField] = useState<CohortGroupField>(COHORT_GROUP_FIELDS[0]);

  const aggregate = useMemo(() => groupCohort(cohort, field), [cohort, field]);
  const headline = topBucket(aggregate);

  if (cohort.length === 0) return null;

  return (
    <section
      className="border border-[color:var(--rule)] bg-[color:var(--parchment)] p-4"
      aria-label={t("precedents.cohortTitle")}
      data-testid="cohort-insights"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-[color:var(--ink)]">
          {t("precedents.cohortTitle")}
        </h2>
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
          {t("precedents.cohortGroupBy")}
          <select
            aria-label={t("precedents.cohortGroupBy")}
            value={field}
            onChange={(e) => {
              setField(e.target.value as CohortGroupField);
              onFilterChange(null);
            }}
            className="border border-[color:var(--rule)] bg-[color:var(--parchment)] px-2 py-1 text-[color:var(--ink)]"
          >
            {COHORT_GROUP_FIELDS.map((f) => (
              <option key={f} value={f}>
                {aggregateFieldLabel(f)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {headline ? (
        <p className="mb-3 font-serif text-base text-[color:var(--ink)]">
          {t("precedents.cohortHeadline", {
            count: headline.count,
            total: cohort.length,
            value: headline.value,
          })}
        </p>
      ) : (
        <p className="mb-3 text-sm text-[color:var(--ink-soft)]">{t("precedents.cohortEmpty")}</p>
      )}

      <FieldCard
        field={field}
        aggregate={aggregate}
        sampleN={cohort.length}
        yAxis="count"
        onBarClick={(clickedField, value) =>
          onFilterChange({ field: clickedField as CohortGroupField, value })
        }
      />

      {filter && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] text-[color:var(--ink-soft)]">
            {t("precedents.cohortFilterActive", {
              value: filter.value,
              count: filteredRankedCount,
            })}
          </span>
          <button
            type="button"
            onClick={() => onFilterChange(null)}
            className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)] underline hover:text-[color:var(--ink)]"
          >
            {t("precedents.cohortClearFilter")}
          </button>
        </div>
      )}

      {filter && filteredRankedCount === 0 && (
        <p className="mt-2 text-sm text-[color:var(--ink-soft)]">{t("precedents.cohortNoRanked")}</p>
      )}
    </section>
  );
}

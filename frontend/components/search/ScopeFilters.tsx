"use client";
import React from "react";

import { CORE_FILTER_FIELD_BY_NAME } from "@/lib/extractions/base-schema-filter-config";
import { applyCoreChange, coreToDrawerValue } from "@/lib/extractions/drawer-adapter";
import type { BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { DateRangeControl } from "./controls/DateRangeControl";
import { EnumMultiControl } from "./controls/EnumMultiControl";

export interface ScopeFiltersProps {
  filters: BaseSchemaFilters;
  onChange: (next: BaseSchemaFilters) => void;
  disabled?: boolean;
}

/**
 * Corpus scope — jurisdiction (PL/UK) and decision date. These are core
 * `judgments` columns, not base_* extraction fields, so they live outside
 * BaseFiltersDrawer/QuickFilters (spec AC5) but share the same controls and
 * filter state.
 */
export function ScopeFilters({ filters, onChange, disabled }: ScopeFiltersProps): React.JSX.Element {
  const jurisdictionCfg = CORE_FILTER_FIELD_BY_NAME.jurisdiction;
  const dateCfg = CORE_FILTER_FIELD_BY_NAME.decision_date;

  const jurisdiction = coreToDrawerValue("jurisdiction", filters.jurisdiction);
  const decisionDate = coreToDrawerValue("decision_date", filters.decision_date);

  const set = (field: string) => (next: BaseFilterValue | undefined) =>
    onChange(applyCoreChange(filters, field, next));

  return (
    <div
      data-testid="scope-filters"
      className="rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3"
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
        Scope
      </span>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        <EnumMultiControl
          label={jurisdictionCfg.label}
          description={jurisdictionCfg.help}
          options={jurisdictionCfg.enumValues ?? []}
          value={jurisdiction?.kind === "enum_multi" ? jurisdiction : undefined}
          onChange={set("jurisdiction")}
          disabled={disabled}
        />
        <DateRangeControl
          label={dateCfg.label}
          description={dateCfg.help}
          value={decisionDate?.kind === "date_range" ? decisionDate : undefined}
          onChange={set("decision_date")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default ScopeFilters;

"use client";
import React from "react";
import {
  FIELDS_BY_GROUP,
  GROUP_ORDER,
  GROUP_LABELS,
  formatEnumLabel,
} from "@/lib/extractions/base-schema-filter-config";
import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import { NumericRangeControl } from "./controls/NumericRangeControl";
import { DateRangeControl } from "./controls/DateRangeControl";
import { BooleanTriControl } from "./controls/BooleanTriControl";
import { EnumMultiControl } from "./controls/EnumMultiControl";
import { TagArrayControl } from "./controls/TagArrayControl";

export interface BaseFiltersDrawerProps {
  /** Current filter state keyed by registry-field name. */
  filters: BaseFilters;
  /** Emitted with `(field, nextValue|undefined)` whenever a control changes. */
  onChange: (field: string, value: BaseFilterValue | undefined) => void;
  /** Clear all filters. */
  onReset: () => void;
  /** Optional facet counts keyed by registry-field name for tag_array autocomplete. */
  facetCounts?: Record<string, Record<string, number>>;
  /** Optional callback when the user types into a tag_array input. */
  onTagQueryChange?: (field: string, q: string) => void;
  /** Disable all controls (e.g. while a search is in flight). */
  disabled?: boolean;
}

export function BaseFiltersDrawer({
  filters,
  onChange,
  onReset,
  facetCounts,
  onTagQueryChange,
  disabled,
}: BaseFiltersDrawerProps): React.JSX.Element {
  const activeCount = Object.values(filters).filter(Boolean).length;
  return (
    <div className="space-y-4 rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
          Filters
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled || activeCount === 0}
          className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--oxblood)] hover:text-[color:var(--oxblood-deep)] disabled:opacity-50"
        >
          Reset{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>
      {GROUP_ORDER.map((group) => {
        const fields = (FIELDS_BY_GROUP[group] ?? []).filter(
          (cfg) => cfg.control !== "substring",
        );
        if (fields.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
              {GROUP_LABELS[group]}
            </h3>
            {fields.map((cfg) => {
              const v = filters[cfg.field];
              const setVal = (next: BaseFilterValue | undefined) =>
                onChange(cfg.field, next);
              switch (cfg.control) {
                case "numeric_range":
                  return (
                    <NumericRangeControl
                      key={cfg.field}
                      label={cfg.label}
                      description={cfg.help}
                      value={v?.kind === "numeric_range" ? v : undefined}
                      onChange={setVal}
                      disabled={disabled}
                    />
                  );
                case "date_range":
                  return (
                    <DateRangeControl
                      key={cfg.field}
                      label={cfg.label}
                      description={cfg.help}
                      value={v?.kind === "date_range" ? v : undefined}
                      onChange={setVal}
                      disabled={disabled}
                    />
                  );
                case "boolean_tri":
                  return (
                    <BooleanTriControl
                      key={cfg.field}
                      label={cfg.label}
                      description={cfg.help}
                      value={v?.kind === "boolean_tri" ? v : undefined}
                      onChange={setVal}
                      disabled={disabled}
                    />
                  );
                case "enum_multi":
                  return (
                    <EnumMultiControl
                      key={cfg.field}
                      label={cfg.label}
                      description={cfg.help}
                      options={cfg.enumValues ?? []}
                      optionLabel={formatEnumLabel}
                      value={v?.kind === "enum_multi" ? v : undefined}
                      onChange={setVal}
                      disabled={disabled}
                    />
                  );
                case "tag_array":
                  return (
                    <TagArrayControl
                      key={cfg.field}
                      label={cfg.label}
                      description={cfg.help}
                      value={v?.kind === "tag_array" ? v : undefined}
                      onChange={setVal}
                      facetCounts={facetCounts?.[cfg.field]}
                      onQueryChange={
                        onTagQueryChange
                          ? (q) => onTagQueryChange(cfg.field, q)
                          : undefined
                      }
                      disabled={disabled}
                    />
                  );
                case "substring":
                  return null; // belongs on /search/extractions only
              }
            })}
          </section>
        );
      })}
    </div>
  );
}

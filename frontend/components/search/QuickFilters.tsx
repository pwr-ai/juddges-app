"use client";
import React from "react";
import {
  QUICK_FILTER_CONFIGS,
  formatEnumOptionLabel,
} from "@/lib/extractions/base-schema-filter-config";
import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import { NumericRangeControl } from "./controls/NumericRangeControl";
import { DateRangeControl } from "./controls/DateRangeControl";
import { BooleanTriControl } from "./controls/BooleanTriControl";
import { EnumMultiControl } from "./controls/EnumMultiControl";
import { TagArrayControl } from "./controls/TagArrayControl";

export interface QuickFiltersProps {
  /**
   * Current filter state keyed by registry-field name — the *same* instance the
   * advanced drawer reads, so a value toggled here shows up there and vice
   * versa (issue #139).
   */
  filters: BaseFilters;
  /** Emitted with `(field, nextValue|undefined)` whenever a quick control changes. */
  onChange: (field: string, value: BaseFilterValue | undefined) => void;
  /** Optional facet counts keyed by registry-field name for tag_array autocomplete. */
  facetCounts?: Record<string, Record<string, number>>;
  /** Optional callback when the user types into a tag_array input. */
  onTagQueryChange?: (field: string, q: string) => void;
  /** Disable all controls (e.g. while a search is in flight). */
  disabled?: boolean;
}

/**
 * Always-visible strip of the highest-signal extraction filters, shown above
 * the advanced drawer on `/search/extractions`. Wires the same controls the
 * drawer uses to the same shared filter state, so the two stay in sync.
 *
 * Responsive: hidden below `md:` (use the drawer on small screens), 2 columns
 * from `md:` upward, and 3 from `xl:` upward — narrow enough that a
 * date-range control's two inputs never overflow into a neighbouring column.
 */
export function QuickFilters({
  filters,
  onChange,
  facetCounts,
  onTagQueryChange,
  disabled,
}: QuickFiltersProps): React.JSX.Element | null {
  if (QUICK_FILTER_CONFIGS.length === 0) return null;

  return (
    <div
      data-testid="quick-filters"
      className="hidden rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3 md:block"
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
        Quick filters
      </span>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
        {QUICK_FILTER_CONFIGS.map((cfg) => {
          const v = filters[cfg.field];
          const setVal = (next: BaseFilterValue | undefined) =>
            onChange(cfg.field, next);
          let content: React.JSX.Element | null;
          switch (cfg.control) {
            case "numeric_range":
              content = (
                <NumericRangeControl
                  label={cfg.label}
                  description={cfg.help}
                  value={v?.kind === "numeric_range" ? v : undefined}
                  onChange={setVal}
                  showDistribution={cfg.showDistribution}
                  disabled={disabled}
                />
              );
              break;
            case "date_range":
              content = (
                <DateRangeControl
                  label={cfg.label}
                  description={cfg.help}
                  value={v?.kind === "date_range" ? v : undefined}
                  onChange={setVal}
                  disabled={disabled}
                />
              );
              break;
            case "boolean_tri":
              content = (
                <BooleanTriControl
                  label={cfg.label}
                  description={cfg.help}
                  value={v?.kind === "boolean_tri" ? v : undefined}
                  onChange={setVal}
                  disabled={disabled}
                />
              );
              break;
            case "enum_multi":
              content = (
                <EnumMultiControl
                  label={cfg.label}
                  description={cfg.help}
                  options={cfg.enumValues ?? []}
                  optionLabel={(optValue) => formatEnumOptionLabel(cfg.field, optValue)}
                  value={v?.kind === "enum_multi" ? v : undefined}
                  onChange={setVal}
                  disabled={disabled}
                />
              );
              break;
            case "tag_array":
              content = (
                <TagArrayControl
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
              break;
            case "substring":
              content = null; // substring fields live in their own inputs above
              break;
          }
          if (content === null) return null;
          return (
            <div key={cfg.field} className="min-w-0">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

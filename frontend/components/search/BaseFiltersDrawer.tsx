"use client";
import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  // Track expanded groups. All groups default to open; users can collapse/expand or toggle all.
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    GROUP_ORDER.forEach((g) => {
      initial[g] = true;
    });
    return initial;
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const allExpanded = GROUP_ORDER.every((g) => expandedGroups[g]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedGroups({});
    } else {
      const all: Record<string, boolean> = {};
      GROUP_ORDER.forEach((g) => {
        all[g] = true;
      });
      setExpandedGroups(all);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3">
      <div className="flex items-center justify-between border-b border-[color:var(--rule)] pb-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
            Advanced Filters
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="text-[11px] font-mono text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] transition-colors underline underline-offset-2"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled || activeCount === 0}
          className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--oxblood)] hover:text-[color:var(--oxblood-deep)] disabled:opacity-40 transition-colors"
        >
          Reset{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      <div className="space-y-2">
        {GROUP_ORDER.map((group) => {
          const fields = (FIELDS_BY_GROUP[group] ?? []).filter(
            (cfg) => cfg.control !== "substring",
          );
          if (fields.length === 0) return null;

          const groupActiveCount = fields.filter((cfg) => Boolean(filters[cfg.field])).length;
          const isExpanded = expandedGroups[group] ?? true;

          return (
            <section
              key={group}
              className="rounded border border-[color:var(--rule)]/60 bg-white/40 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[color:var(--parchment-deep)]/50 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ink-soft)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[color:var(--ink-soft)]" />
                  )}
                  <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-[color:var(--ink)]">
                    {GROUP_LABELS[group]}
                  </h3>
                </div>
                {groupActiveCount > 0 && (
                  <span className="rounded bg-[color:var(--oxblood)] px-1.5 py-0.5 text-[10px] font-mono font-medium text-white">
                    {groupActiveCount} active
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="grid grid-cols-1 gap-3 border-t border-[color:var(--rule)]/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map((cfg) => {
                    const v = filters[cfg.field];
                    const setVal = (next: BaseFilterValue | undefined) =>
                      onChange(cfg.field, next);
                    switch (cfg.control) {
                      case "numeric_range":
                        return (
                          <NumericRangeControl
                            key={cfg.field}
                            field={cfg.field}
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
                        return null;
                    }
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

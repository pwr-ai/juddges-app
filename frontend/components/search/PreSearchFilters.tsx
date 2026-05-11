"use client";

import React from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { SearchModeToggle } from "@/components/search/SearchModeToggle";
import { ExtractedFieldsFilter } from "@/components/search/ExtractedFieldsFilter";
import type {
  BaseFilters,
  BaseNumericRange,
  SearchMode,
} from "@/lib/store/searchStore";

export interface PreSearchFiltersProps {
  // Languages
  selectedLanguages: Set<string>;
  onToggleLanguage: (language: string) => void;
  // Mode
  searchMode: SearchMode;
  onChangeMode: (mode: SearchMode) => void;
  // Date range
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onChangeDate: (field: "dateFrom" | "dateTo", value: Date | undefined) => void;
  // Extracted-field numeric ranges
  baseFilters: BaseFilters;
  onChangeBaseFilter: (field: keyof BaseFilters, range: BaseNumericRange | undefined) => void;
  onResetBaseFilters: () => void;
  // Shared
  disabled?: boolean;
  className?: string;
}

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pl", label: "PL" },
  { value: "uk", label: "UK" },
];

function dateToInputValue(date: Date | undefined): string {
  if (!date) return "";
  const iso = date.toISOString();
  return iso.slice(0, 10);
}

function inputValueToDate(value: string): Date | undefined {
  if (!value) return undefined;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t) : undefined;
}

export function PreSearchFilters({
  selectedLanguages,
  onToggleLanguage,
  searchMode,
  onChangeMode,
  dateFrom,
  dateTo,
  onChangeDate,
  baseFilters,
  onChangeBaseFilter,
  onResetBaseFilters,
  disabled,
  className,
}: PreSearchFiltersProps): React.JSX.Element {
  const extractedActiveCount = (Object.keys(baseFilters) as Array<keyof BaseFilters>).filter(
    (k) => baseFilters[k] && (baseFilters[k]?.min !== undefined || baseFilters[k]?.max !== undefined)
  ).length;

  const onlyOneLanguage = selectedLanguages.size === 1;

  return (
    <div
      className={cn(
        "rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)]/60 p-3",
        className
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
        {/* Languages */}
        <div className="min-w-[160px]">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
            Languages
          </div>
          <div role="group" aria-label="Languages" className="flex gap-1">
            {LANGUAGE_OPTIONS.map((opt) => {
              const selected = selectedLanguages.has(opt.value);
              const lockedLast = selected && onlyOneLanguage;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={`${opt.label} — ${selected ? "selected" : "not selected"}`}
                  title={lockedLast ? "At least one language must remain selected" : opt.label}
                  disabled={disabled || lockedLast}
                  onClick={() => onToggleLanguage(opt.value)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--oxblood)]",
                    selected
                      ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--parchment)]"
                      : "border-[color:var(--rule)] bg-white text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]",
                    (disabled || lockedLast) && "cursor-not-allowed opacity-60"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search mode */}
        <div className="min-w-[260px] flex-1">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
            Search mode
          </div>
          <SearchModeToggle
            mode={searchMode}
            onChange={onChangeMode}
            disabled={disabled}
          />
        </div>

        {/* Date range */}
        <div className="min-w-[260px]">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
            Decision date
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateToInputValue(dateFrom)}
              disabled={disabled}
              onChange={(e) => onChangeDate("dateFrom", inputValueToDate(e.target.value))}
              aria-label="From date"
              className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
            />
            <span className="text-[color:var(--ink-soft)]">–</span>
            <input
              type="date"
              value={dateToInputValue(dateTo)}
              disabled={disabled}
              onChange={(e) => onChangeDate("dateTo", inputValueToDate(e.target.value))}
              aria-label="To date"
              className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Extracted fields (text mode only) — collapsed by default to keep the strip compact */}
      {searchMode === "text" && (
        <details className="group mt-3 rounded-md border border-[color:var(--rule)] bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
            <span>
              Extracted fields
              {extractedActiveCount > 0 && (
                <span className="ml-2 rounded-full bg-[color:var(--oxblood)]/10 px-2 py-0.5 text-[10px] text-[color:var(--oxblood)]">
                  {extractedActiveCount} active
                </span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-[color:var(--rule)] p-2">
            <ExtractedFieldsFilter
              filters={baseFilters}
              onChange={onChangeBaseFilter}
              onReset={onResetBaseFilters}
              disabled={disabled}
              className="border-0 bg-transparent p-0"
            />
          </div>
        </details>
      )}
    </div>
  );
}

"use client";

import React, { useCallback } from "react";

import { cn } from "@/lib/utils";
import type { BaseFilters, BaseNumericRange, BaseFilterValue } from "@/lib/store/searchStore";

// TODO(task-17): remove when this file is deleted.
// Temporary adapter to convert old BaseNumericRange interface to new discriminated union
function adaptRangeToFilterValue(range: BaseNumericRange | undefined): BaseFilterValue | undefined {
  if (!range || (range.min === undefined && range.max === undefined)) return undefined;
  return { kind: "numeric_range", range };
}

function adaptFilterValueToRange(value: BaseFilterValue | undefined): BaseNumericRange | undefined {
  if (!value) return undefined;
  if (value.kind === "numeric_range") return value.range;
  return undefined;
}

export interface ExtractedFieldsFilterProps {
  filters: BaseFilters;
  onChange: (field: string, value: BaseFilterValue | undefined) => void;
  onReset: () => void;
  disabled?: boolean;
  className?: string;
}

interface NumericFieldConfig {
  key: string;
  label: string;
  description?: string;
  min?: number;
  step?: number;
  /** True when the on-disk value is epoch seconds and the input is `<input type="date">`. */
  asDate?: boolean;
}

const FIELDS: NumericFieldConfig[] = [
  {
    key: "numVictims",
    label: "Number of victims",
    min: 0,
    step: 1,
  },
  {
    key: "victimAgeOffence",
    label: "Victim age at offence",
    min: 0,
    step: 1,
  },
  {
    key: "caseNumber",
    label: "Extracted case number",
    description: "Numeric case identifier from the extraction",
    min: 0,
    step: 1,
  },
  {
    key: "coDefAccNum",
    label: "Co-defendant count",
    min: 0,
    step: 1,
  },
  {
    key: "appealJudgmentDate",
    label: "Appeal judgment date",
    description: "Range over `base_date_of_appeal_court_judgment`",
    asDate: true,
  },
];

function dateToEpochSeconds(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

function epochSecondsToDate(seconds: number | undefined): string {
  if (typeof seconds !== "number") return "";
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function rangeBound(value: string, asDate: boolean): number | undefined {
  if (value === "") return undefined;
  if (asDate) return dateToEpochSeconds(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function ExtractedFieldsFilter({
  filters,
  onChange,
  onReset,
  disabled,
  className,
}: ExtractedFieldsFilterProps): React.JSX.Element {
  const handleBound = useCallback(
    (config: NumericFieldConfig, side: "min" | "max", raw: string) => {
      const currentValue = filters[config.key];
      const currentRange = adaptFilterValueToRange(currentValue) ?? {};
      const bound = rangeBound(raw, Boolean(config.asDate));
      const nextRange: BaseNumericRange = {
        ...currentRange,
        [side]: bound,
      };
      const nextValue = adaptRangeToFilterValue(nextRange);
      onChange(config.key, nextValue);
    },
    [filters, onChange]
  );

  const activeCount = Object.keys(filters).filter(
    (k) => {
      const value = filters[k];
      const range = adaptFilterValueToRange(value);
      return range && (range.min !== undefined || range.max !== undefined);
    }
  ).length;

  return (
    <div
      className={cn(
        "rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-3",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--ink-soft)]">
          Extracted fields
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--oxblood)] hover:text-[color:var(--oxblood-deep)] disabled:opacity-50"
          >
            Reset ({activeCount})
          </button>
        )}
      </div>
      <div className="space-y-3">
        {FIELDS.map((config) => {
          const value = filters[config.key];
          const range = adaptFilterValueToRange(value);
          const inputType = config.asDate ? "date" : "number";
          const minValue = config.asDate
            ? epochSecondsToDate(range?.min)
            : range?.min !== undefined
              ? String(range.min)
              : "";
          const maxValue = config.asDate
            ? epochSecondsToDate(range?.max)
            : range?.max !== undefined
              ? String(range.max)
              : "";
          return (
            <div key={config.key}>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ink)]">
                {config.label}
              </label>
              {config.description && (
                <div className="mb-1 text-[11px] text-[color:var(--ink-soft)]">
                  {config.description}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type={inputType}
                  min={config.min}
                  step={config.step}
                  value={minValue}
                  disabled={disabled}
                  onChange={(e) => handleBound(config, "min", e.target.value)}
                  placeholder="min"
                  aria-label={`${config.label} minimum`}
                  className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
                />
                <span className="text-[color:var(--ink-soft)]">–</span>
                <input
                  type={inputType}
                  min={config.min}
                  step={config.step}
                  value={maxValue}
                  disabled={disabled}
                  onChange={(e) => handleBound(config, "max", e.target.value)}
                  placeholder="max"
                  aria-label={`${config.label} maximum`}
                  className="w-full rounded border border-[color:var(--rule)] bg-white px-2 py-1 text-xs text-[color:var(--ink)] focus:outline-none focus:ring-1 focus:ring-[color:var(--oxblood)] disabled:opacity-50"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Adapter: BaseSchemaFilters (RPC JSON) <-> BaseFilters (drawer/control union).
//
// Lifted out of app/search/extractions/page.tsx so /search/extractions,
// /compare (Spec C) and Spec B's ScopeFilters share ONE conversion. Dates: the
// RPC speaks ISO `{from,to}`; the controls speak epoch-second `{min,max}`
// (DateRangeControl.tsx, via lib/extractions/epoch-date.ts). The old page
// adapter passed strings through and produced `'1735689600'::DATE` casts in
// Postgres.
// =============================================================================

import type { BaseFilters, BaseFilterValue } from "@/lib/store/searchStore";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { CORE_FILTER_FIELD_BY_NAME, isCoreFilterField } from "./base-schema-filter-config";
import { dateToEpochSeconds, epochSecondsToDate } from "./epoch-date";

const SUBSTRING_FIELDS = new Set([
  "case_name",
  "neutral_citation_number",
  "appeal_court_judges_names",
  "offender_representative_name",
]);

/** Re-exported under the adapter's own naming for ISO<->epoch date conversion. */
export function isoToEpochSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  return dateToEpochSeconds(iso);
}

export function epochSecondsToIso(s: number | undefined): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  const iso = epochSecondsToDate(s);
  return iso === "" ? undefined : iso;
}

/**
 * Normalise the two date-range shapes the RPC accepts. `{from,to}` is what the
 * frontend ever builds; `{min,max}` is only reachable via a hand-edited URL
 * (ruling 3) but the RPC accepts it too, so treat `min` as `from` and `max` as
 * `to` before converting to the drawer's epoch range.
 */
function normaliseDateRange(v: Record<string, unknown>): { from?: string; to?: string } {
  if ("from" in v || "to" in v) {
    return { from: v.from as string | undefined, to: v.to as string | undefined };
  }
  return { from: v.min as string | undefined, to: v.max as string | undefined };
}

function toDrawerValue(value: unknown): BaseFilterValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.length === 0 ? undefined : { kind: "tag_array", values: value as string[] };
  }
  if (typeof value === "boolean") return { kind: "boolean_tri", value };
  if (typeof value === "number") return { kind: "numeric_range", range: { min: value, max: value } };
  if (typeof value === "string") {
    // scalar ISO date (RPC also accepts a bare "YYYY-MM-DD" for eq).
    const epoch = isoToEpochSeconds(value);
    return epoch === undefined ? undefined : { kind: "date_range", range: { min: epoch, max: epoch } };
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("from" in v || "to" in v || "min" in v || "max" in v) {
      // Numeric ranges use {min,max} with numbers; date ranges use {from,to}
      // (or, per ruling 3, {min,max} with ISO strings from a hand-edited URL).
      const isNumeric =
        ("min" in v && typeof v.min === "number") || ("max" in v && typeof v.max === "number");
      if (isNumeric) {
        return { kind: "numeric_range", range: { min: v.min as number | undefined, max: v.max as number | undefined } };
      }
      const { from, to } = normaliseDateRange(v);
      return { kind: "date_range", range: { min: isoToEpochSeconds(from), max: isoToEpochSeconds(to) } };
    }
  }
  return undefined;
}

/** Non-substring, non-core fields → drawer union. */
export function toDrawerFilters(s: BaseSchemaFilters): BaseFilters {
  const out: BaseFilters = {};
  for (const [field, value] of Object.entries(s)) {
    if (SUBSTRING_FIELDS.has(field) || isCoreFilterField(field)) continue;
    const v = toDrawerValue(value);
    if (v) out[field] = v;
  }
  return out;
}

/**
 * Core field (jurisdiction / decision_date) → control value. The control kind
 * is decided by CORE_FILTER_FIELD_BY_NAME[field].control (single source of
 * truth for which fields are enum_multi vs date_range), not a hardcoded field
 * name check.
 */
export function coreToDrawerValue(field: string, value: unknown): BaseFilterValue | undefined {
  const v = toDrawerValue(value);
  if (!v) return undefined;
  const control = CORE_FILTER_FIELD_BY_NAME[field]?.control;
  if (control === "enum_multi" && v.kind === "tag_array") {
    return { kind: "enum_multi", values: v.values };
  }
  return v;
}

function fromDrawerValue(value: BaseFilterValue): unknown {
  switch (value.kind) {
    case "tag_array":
    case "enum_multi":
      return value.values;
    case "boolean_tri":
      return value.value;
    case "numeric_range":
      return value.range.min === value.range.max && value.range.min !== undefined
        ? value.range.min
        : { min: value.range.min, max: value.range.max };
    case "date_range":
      return { from: epochSecondsToIso(value.range.min), to: epochSecondsToIso(value.range.max) };
  }
}

export function applyDrawerChange(
  s: BaseSchemaFilters,
  field: string,
  value: BaseFilterValue | undefined,
): BaseSchemaFilters {
  const next = { ...s } as Record<string, unknown>;
  if (value === undefined) delete next[field];
  else next[field] = fromDrawerValue(value);
  return next as BaseSchemaFilters;
}

/** Same as applyDrawerChange; named separately so call sites read clearly. */
export const applyCoreChange = applyDrawerChange;

/**
 * Aggregable fields for the Statistics view (#708). The canonical list is
 * aggregable-fields.json (shared with the backend, which has a test pinning
 * its Python mirror to the same file). Labels come from the filter config
 * where a filter exists, otherwise from CORE_LABELS.
 */
import canonical from "./aggregable-fields.json";
import { ALL_FILTER_FIELD_BY_NAME } from "./base-schema-filter-config";

export const AGGREGABLE_FIELDS: readonly string[] = canonical.fields;
export const DEFAULT_AGGREGATE_FIELDS: readonly string[] = canonical.default;

/** Sample sizes offered by the scale slider; `undefined` means the whole cohort. */
export const SCALE_STOPS: readonly number[] = [10, 50, 100, 1000, 5000];

const CORE_LABELS: Record<string, string> = {
  court_name: "Court",
  offender_age_offence: "Offender age at offence",
  deep_complexity_score: "Complexity (model score)",
  deep_reasoning_quality_score: "Reasoning quality (model score)",
  deep_legal_domains: "Legal domains (model)",
  deep_reasoning_patterns: "Reasoning patterns (model)",
  deep_judicial_tone: "Judicial tone (model)",
  deep_precedential_value: "Precedential value (model)",
};

const SET = new Set(AGGREGABLE_FIELDS);

export function isAggregableField(field: string): boolean {
  return SET.has(field);
}

export function aggregateFieldLabel(field: string): string {
  return ALL_FILTER_FIELD_BY_NAME[field]?.label ?? CORE_LABELS[field] ?? field;
}

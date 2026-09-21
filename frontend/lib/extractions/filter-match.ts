// =============================================================================
// Which metadata cells on /documents/[id] satisfied a BaseSchemaFilters blob?
// Mirrors the RPC semantics per control kind (= ANY / && / range / ILIKE) so a
// highlighted cell is exactly one the query matched on. Pure function.
// =============================================================================

import type { BaseSchemaFilters } from "@/types/base-schema-filter";

/** Core RPC filter field → metadata key emitted by /documents/{id}/metadata. */
const CORE_FIELD_TO_METADATA_KEY: Record<string, string> = {
  jurisdiction: "country", // conversion.py:30 — country = judgments.jurisdiction
  decision_date: "date_issued", // conversion.py:33 — date_issued = decision_date
};

function metadataKeyFor(field: string): string {
  return CORE_FIELD_TO_METADATA_KEY[field] ?? `base_${field}`;
}

function toIsoDay(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 10) return undefined;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function matches(filterValue: unknown, actual: unknown): boolean {
  if (actual === undefined || actual === null) return false;

  if (Array.isArray(filterValue)) {
    // IN-list / array overlap (case-sensitive like the RPC)
    const wanted = new Set(filterValue.map(String));
    return asStringArray(actual).some((v) => wanted.has(v));
  }
  if (typeof filterValue === "boolean") return actual === filterValue;
  if (typeof filterValue === "number") return Number(actual) === filterValue;
  if (typeof filterValue === "string") {
    const day = toIsoDay(actual);
    if (/^\d{4}-\d{2}-\d{2}$/.test(filterValue) && day) return day === filterValue;
    return String(actual).toLowerCase().includes(filterValue.toLowerCase()); // ILIKE
  }
  if (typeof filterValue === "object") {
    const f = filterValue as { min?: number; max?: number; from?: string; to?: string };
    if ("from" in f || "to" in f) {
      const day = toIsoDay(actual);
      if (!day) return false;
      return (!f.from || day >= f.from) && (!f.to || day <= f.to);
    }
    const n = Number(actual);
    if (!Number.isFinite(n)) return false;
    return (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max);
  }
  return false;
}

export function matchedMetadataKeys(
  filters: BaseSchemaFilters,
  metadata: Record<string, unknown>,
): Set<string> {
  const hits = new Set<string>();
  for (const [field, filterValue] of Object.entries(filters) as [
    keyof BaseSchemaFilters,
    unknown,
  ][]) {
    if (filterValue === undefined || filterValue === null) continue;
    const key = metadataKeyFor(field);
    if (matches(filterValue, metadata[key])) hits.add(key);
  }
  return hits;
}

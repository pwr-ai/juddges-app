/**
 * Serialise / deserialise the `BaseFilters` discriminated union to
 * URLSearchParams using the `f.<field>(.{min|max})?` key convention.
 *
 *  enum_multi / tag_array  → repeated `f.<field>=value`
 *  boolean_tri             → `f.<field>=true` | `f.<field>=false`  (omitted when undefined)
 *  numeric_range / date_range → `f.<field>.min=N`, `f.<field>.max=N`
 *
 * Unknown fields and unknown query keys are dropped silently so older
 * bookmarks degrade gracefully.
 */
import type {
  BaseFilters,
  BaseFilterValue,
  BaseNumericRange,
} from "@/lib/store/searchStore";
import { FILTER_FIELD_BY_NAME } from "./base-schema-filter-config";

const PREFIX = "f.";

export function encodeBaseFilters(filters: BaseFilters): URLSearchParams {
  const out = new URLSearchParams();
  for (const [field, value] of Object.entries(filters)) {
    if (!value) continue;
    const key = `${PREFIX}${field}`;
    switch (value.kind) {
      case "enum_multi":
      case "tag_array":
        value.values.forEach((v) => out.append(key, v));
        break;
      case "boolean_tri":
        out.set(key, String(value.value));
        break;
      case "numeric_range":
      case "date_range":
        if (typeof value.range.min === "number") out.set(`${key}.min`, String(value.range.min));
        if (typeof value.range.max === "number") out.set(`${key}.max`, String(value.range.max));
        break;
    }
  }
  return out;
}

export function decodeBaseFilters(params: URLSearchParams): BaseFilters {
  const out: BaseFilters = {};
  for (const [key, raw] of params.entries()) {
    if (!key.startsWith(PREFIX)) continue;
    const tail = key.slice(PREFIX.length);
    const [field, bound] = tail.split(".") as [string, "min" | "max" | undefined];
    const cfg = FILTER_FIELD_BY_NAME[field];
    if (!cfg) continue;

    if (cfg.control === "enum_multi" || cfg.control === "tag_array") {
      const existing = (out[field] as
        | Extract<BaseFilterValue, { kind: "enum_multi" | "tag_array" }>
        | undefined)?.values ?? [];
      out[field] = { kind: cfg.control, values: [...existing, raw] };
    } else if (cfg.control === "boolean_tri") {
      if (raw === "true") out[field] = { kind: "boolean_tri", value: true };
      else if (raw === "false") out[field] = { kind: "boolean_tri", value: false };
    } else if (cfg.control === "numeric_range" || cfg.control === "date_range") {
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      const existing = (out[field] as
        | Extract<BaseFilterValue, { kind: "numeric_range" | "date_range" }>
        | undefined)?.range ?? ({} as BaseNumericRange);
      const next: BaseNumericRange = { ...existing, [bound ?? "min"]: num };
      out[field] = { kind: cfg.control, range: next };
    }
  }
  return out;
}

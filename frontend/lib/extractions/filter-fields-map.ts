/**
 * Registry-field name → Meili column name.
 *
 * Most registry fields prefix with `base_`. Date-range fields target the
 * epoch-second twin (`*_ts`) emitted by the backend transformer.
 *
 * Single source of truth for the `buildMeilisearchFilter` translator
 * (`hooks/useSearchResults.ts`) and the URL serializer.
 */
import { FILTER_FIELDS } from "./base-schema-filter-config";

export const BASE_FILTER_FIELDS: Record<string, string> = Object.fromEntries(
  FILTER_FIELDS.map((c) => {
    const meiliField =
      c.control === "date_range" ? `base_${c.field}_ts` : `base_${c.field}`;
    return [c.field, meiliField];
  }),
);

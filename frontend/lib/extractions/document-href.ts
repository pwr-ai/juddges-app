// =============================================================================
// Result-row link for /search/extractions → /documents/[id].
//
// Carries the active filter blob (?f=) so the judgment page can decode it,
// highlight the base_* metadata cells that satisfied the filter, and jump to
// them via the #base-fields anchor. Built on buildFilterHref, the one place
// that serialises filter state into a URL, so the query-string shape stays
// identical between /search/extractions and /documents/[id].
// =============================================================================

import type { BaseSchemaFilters } from "@/types/base-schema-filter";

import { buildFilterHref } from "./use-extracted-data-filters";

/** Anchor id of the base-schema fields grid on /documents/[id]. */
export const BASE_FIELDS_ANCHOR = "base-fields";

/**
 * Result-row link for /search/extractions. The judgment page reads `?f=` back
 * with decodeFilters() and highlights the base_* cells that satisfied it.
 */
export function buildDocumentHref(id: string, filters: BaseSchemaFilters): string {
  // buildFilterHref appends "?f=<blob>" only when the filters blob is
  // non-empty (no other FilterUrlState fields are passed here), so the
  // presence of a query string is exactly "the filter carried something" —
  // no need to call encodeFilters(filters) a second time to decide the anchor.
  const href = buildFilterHref(`/documents/${encodeURIComponent(id)}`, { filters });
  return href.includes("?") ? `${href}#${BASE_FIELDS_ANCHOR}` : href;
}

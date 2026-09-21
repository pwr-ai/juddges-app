// =============================================================================
// Result-row link for /search/extractions → /documents/[id].
//
// Carries the active filter blob (?f=) so the judgment page can decode it,
// highlight the base_* metadata cells that satisfied the filter, and jump to
// them via the #base-fields anchor. Built on buildFilterHref, the one place
// that serialises filter state into a URL, so the query-string shape stays
// identical between /search/extractions and /documents/[id].
// =============================================================================

import type { FilterUrlState } from "@/lib/extractions/use-extracted-data-filters";

import { buildFilterHref } from "./use-extracted-data-filters";

/** Anchor id of the base-schema fields grid on /documents/[id]. */
export const BASE_FIELDS_ANCHOR = "base-fields";

/**
 * Result-row link for /search/extractions. Carries the page's full URL state
 * (filters, text query, page, NL question) so that navigating back from the
 * judgment reader lands on the same result set instead of a blank filter.
 * The judgment page reads `?f=` back with decodeFilters() and highlights the
 * base_* cells that satisfied it.
 */
export function buildDocumentHref(id: string, state: FilterUrlState): string {
  const href = buildFilterHref(`/documents/${encodeURIComponent(id)}`, state);
  // buildFilterHref appends a query string only when state carries something
  // (filters, text query, page > 1, or an NL question), so the presence of a
  // query string is exactly "there's something to anchor to".
  return href.includes("?") ? `${href}#${BASE_FIELDS_ANCHOR}` : href;
}

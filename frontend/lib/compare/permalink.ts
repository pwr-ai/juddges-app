import { buildFilterHref } from "@/lib/extractions/use-extracted-data-filters";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

function base(origin?: string): string {
  return origin ?? (typeof window === "undefined" ? "" : window.location.origin);
}

/**
 * `/compare?f=<blob>&q=<text>` — built on the same URL codec as
 * /search/extractions (`buildFilterHref`), so links are portable between the
 * two pages.
 */
export function buildComparePermalink(filters: BaseSchemaFilters, textQuery: string, origin?: string): string {
  return buildFilterHref("/compare", { filters, textQuery }, origin ?? window.location.origin);
}

export function buildPairPermalink(pairId: string, origin?: string): string {
  return `${base(origin)}/compare/${encodeURIComponent(pairId)}`;
}

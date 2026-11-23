// =============================================================================
// API client + React Query hooks for the base-schema filter surface.
//
// Routes:
//   POST /api/extractions/base-schema/filter         — filtered judgment list
//   GET  /api/extractions/base-schema/facets/[field] — facet counts per field
//
// The Next.js routes proxy to the FastAPI backend, which calls the Postgres
// RPC `filter_documents_by_extracted_data` (extended in
// supabase/migrations/20260505000001_*).
// =============================================================================

"use client";

import { useQuery } from "@tanstack/react-query";

import type {
  AggregateRequest,
  AggregateResponse,
  BaseSchemaFilterRequest,
  BaseSchemaFilterResponse,
  FacetCount,
  Jurisdiction,
  NumericHistogramResponse,
} from "@/types/base-schema-filter";

const FILTER_URL = "/api/extractions/base-schema/filter";
const FACETS_URL = "/api/extractions/base-schema/facets";
const HISTOGRAM_URL = "/api/extractions/base-schema/histogram";
const AGGREGATE_URL = "/api/extractions/base-schema/aggregate";

async function postFilter(
  request: BaseSchemaFilterRequest,
  signal?: AbortSignal,
): Promise<BaseSchemaFilterResponse> {
  const response = await fetch(FILTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Filter request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as BaseSchemaFilterResponse;
}

/**
 * The jurisdiction to scope facet/histogram requests to: only when exactly one
 * is selected. Zero or both selected means "whole corpus", so nothing is sent.
 */
export function singleJurisdiction(
  selected: readonly Jurisdiction[] | undefined | null,
): Jurisdiction | null {
  return selected && selected.length === 1 ? selected[0] : null;
}

export async function fetchFacet(
  field: string,
  jurisdiction?: Jurisdiction | null,
  signal?: AbortSignal,
): Promise<FacetCount[]> {
  const query = jurisdiction
    ? `?jurisdiction=${encodeURIComponent(jurisdiction)}`
    : "";
  const response = await fetch(
    `${FACETS_URL}/${encodeURIComponent(field)}${query}`,
    { signal },
  );
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Facet fetch failed for ${field}: ${response.status}`);
  }
  // Backend FacetCountsResponse: { field, counts: [{ value, count }], total }.
  const json = (await response.json()) as { counts?: FacetCount[] };
  return json.counts ?? [];
}

/** Filtered list of judgments. Cached for 30s; results table-friendly. */
export function useExtractionResults(
  request: BaseSchemaFilterRequest,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["base-schema-filter", request],
    queryFn: ({ signal }) => postFilter(request, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** Facet counts for one field. Cached longer — values shift slowly. */
export function useExtractionFacet(
  field: string | null,
  enabled: boolean = true,
  jurisdiction: Jurisdiction | null = null,
) {
  return useQuery({
    queryKey: ["base-schema-facet", field, jurisdiction],
    queryFn: ({ signal }) => fetchFacet(field as string, jurisdiction, signal),
    enabled: enabled && Boolean(field),
    staleTime: 5 * 60_000,
  });
}

export async function fetchHistogram(
  field: string,
  buckets: number,
  jurisdiction?: Jurisdiction | null,
  signal?: AbortSignal,
): Promise<NumericHistogramResponse> {
  const scope = jurisdiction
    ? `&jurisdiction=${encodeURIComponent(jurisdiction)}`
    : "";
  const response = await fetch(
    `${HISTOGRAM_URL}/${encodeURIComponent(field)}?buckets=${buckets}${scope}`,
    { signal },
  );
  if (!response.ok) {
    if (response.status === 404) {
      return { field, buckets: [], total: 0 };
    }
    throw new Error(`Histogram fetch failed for ${field}: ${response.status}`);
  }
  return (await response.json()) as NumericHistogramResponse;
}

/**
 * Numeric distribution histogram for a range-filterable field. Cached 1h —
 * corpus distributions barely shift (issue #140).
 */
export function useNumericHistogram(
  field: string | null,
  buckets: number = 20,
  enabled: boolean = true,
  jurisdiction: Jurisdiction | null = null,
) {
  return useQuery({
    queryKey: ["base-schema-histogram", field, buckets, jurisdiction],
    queryFn: ({ signal }) =>
      fetchHistogram(field as string, buckets, jurisdiction, signal),
    enabled: enabled && Boolean(field),
    staleTime: 3_600_000,
  });
}

async function postAggregate(
  request: AggregateRequest,
  signal?: AbortSignal,
): Promise<AggregateResponse> {
  const response = await fetch(AGGREGATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Aggregate request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as AggregateResponse;
}

/** Statistics over the cohort defined by `request.filters` (#708). */
export function useExtractionAggregate(request: AggregateRequest, enabled: boolean = true) {
  return useQuery({
    queryKey: ["base-schema-aggregate", request],
    queryFn: ({ signal }) => postAggregate(request, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

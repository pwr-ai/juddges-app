"use client";

import { useQuery } from "@tanstack/react-query";

import { createCollectionFromFilter } from "@/lib/api/collections";
import { downloadBlob } from "@/lib/file-export";
import type { BaseSchemaFilters, CollectionFromFilterResponse } from "@/types/base-schema-filter";

import type { CompareRequest, CompareResponse, PairCompareResponse } from "./types";

/** True when `error` is one of our `.status`-tagged fetch failures. */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const message = (await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export function fetchCompare(req: CompareRequest, signal?: AbortSignal) {
  return postJson<CompareResponse>("/api/compare/facets", req, signal);
}

export function useCompare(req: CompareRequest, enabled: boolean) {
  return useQuery({
    queryKey: ["compare", req],
    queryFn: ({ signal }) => fetchCompare(req, signal),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    // A 4xx (bad filter, not found, ...) will not succeed on retry; only
    // let the default QueryClient retry (`retry: 1`, app/providers.tsx)
    // apply to transient failures.
    retry: (failureCount, error) => {
      const status = errorStatus(error);
      if (status != null && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
  });
}

export async function fetchComparePair(pairId: string, signal?: AbortSignal): Promise<PairCompareResponse> {
  const res = await fetch(`/api/compare/pairs/${encodeURIComponent(pairId)}`, { signal });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

export function useComparePair(pairId: string) {
  return useQuery({
    queryKey: ["compare-pair", pairId],
    queryFn: ({ signal }) => fetchComparePair(pairId, signal),
    staleTime: 60_000,
    // A 404 (deleted / inaccessible pair) will not succeed on retry; the
    // default QueryClient (`retry: 1`, app/providers.tsx) would otherwise
    // double-fetch before PairContent can show the not-found state.
    retry: (failureCount, error) => errorStatus(error) !== 404 && failureCount < 1,
  });
}

/**
 * Saves the pair by delegating to the existing save-as-collection endpoint
 * with `split_by_jurisdiction: true` (Spec C) -- there is no separate
 * `POST /collections/pairs` creation path; that route only lists/reads/deletes.
 * Returns the same `CollectionFromFilterResponse` as `createCollectionFromFilter`
 * (two `CreatedCollection`s + `pair_id`), not a `CollectionPair` -- the two
 * sides are still being bulk-filled at that point, so the caller reads
 * `pair_id` and fetches the pair separately if it needs the full row.
 *
 * A too-large filter (either side over the per-collection cap) rejects with
 * the existing `CollectionFromFilterError`, recognised by
 * `error.status === 413` (see `lib/api/collections.ts`) -- callers do not
 * need a compare-specific error type.
 */
export function createCollectionPair(body: {
  name: string;
  filters: BaseSchemaFilters;
  text_query: string | null;
}): Promise<CollectionFromFilterResponse> {
  return createCollectionFromFilter({ ...body, split_by_jurisdiction: true });
}

export async function downloadCompareCsv(req: CompareRequest): Promise<void> {
  const res = await fetch("/api/compare/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "compare.csv";
  downloadBlob(await res.blob(), name);
}

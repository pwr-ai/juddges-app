// =============================================================================
// Filter-state hook for /search/extractions.
//
// Owns BaseSchemaFilters + textQuery + page + pageSize. Persists state in the
// URL using two query params:
//
//   ?q=<text>           — full-text query (mirrors RPC `text_query`)
//   ?f=<base64-json>    — opaque blob holding the structured filters
//   ?page=<n>           — 1-based page (default 1)
//
// The blob is opaque on purpose: the field set is wide (42 keys) and any
// schema growth would force a URL-format migration if we encoded each field
// individually. A base64-JSON blob round-trips cleanly and stays compact for
// realistic filter combinations (~30–80 chars).
// =============================================================================

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BaseSchemaFilters } from "@/types/base-schema-filter";

const DEFAULT_PAGE_SIZE = 25;

interface FilterState {
  filters: BaseSchemaFilters;
  textQuery: string;
  page: number;
}

interface UseExtractedDataFiltersResult extends FilterState {
  pageSize: number;
  setFilters: (next: BaseSchemaFilters) => void;
  setTextQuery: (next: string) => void;
  setPage: (page: number) => void;
  removeFilter: (field: keyof BaseSchemaFilters) => void;
  clearAll: () => void;
  /** Active filter count (excludes empty arrays / empty strings). */
  activeCount: number;
}

// -----------------------------------------------------------------------------
// URL <-> state helpers (exported for tests).
// -----------------------------------------------------------------------------

export function encodeFilters(filters: BaseSchemaFilters): string {
  const cleaned = pruneEmpty(filters);
  if (Object.keys(cleaned).length === 0) return "";
  const json = JSON.stringify(cleaned);
  if (typeof window === "undefined") {
    return Buffer.from(json, "utf-8").toString("base64url");
  }
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeFilters(blob: string | null | undefined): BaseSchemaFilters {
  if (!blob) return {};
  try {
    const padded = blob.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof window === "undefined"
        ? Buffer.from(padded, "base64").toString("utf-8")
        : decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function pruneEmpty(filters: BaseSchemaFilters): BaseSchemaFilters {
  const out: BaseSchemaFilters = {};
  for (const [key, value] of Object.entries(filters) as [
    keyof BaseSchemaFilters,
    unknown,
  ][]) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    ) {
      continue;
    }
    // assignment is safe — pruneEmpty preserves the original key/value types
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function countActive(filters: BaseSchemaFilters): number {
  return Object.keys(pruneEmpty(filters)).length;
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

export function useExtractedDataFilters(): UseExtractedDataFiltersResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo<FilterState>(
    () => ({
      filters: decodeFilters(searchParams.get("f")),
      textQuery: searchParams.get("q") ?? "",
      page: Math.max(1, Number(searchParams.get("page") ?? "1") || 1),
    }),
    // intentionally only on mount; later updates use writeUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [state, setState] = useState<FilterState>(initial);

  const writeUrl = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams();
      const blob = encodeFilters(next.filters);
      if (blob) params.set("f", blob);
      if (next.textQuery.trim() !== "") params.set("q", next.textQuery.trim());
      if (next.page > 1) params.set("page", String(next.page));
      const queryString = params.toString();
      const url = queryString ? `?${queryString}` : window.location.pathname;
      router.replace(url, { scroll: false });
    },
    [router],
  );

  // Sync URL whenever state changes after the initial render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    writeUrl(state);
  }, [state, writeUrl]);

  const setFilters = useCallback((next: BaseSchemaFilters) => {
    setState((prev) => ({ ...prev, filters: pruneEmpty(next), page: 1 }));
  }, []);

  const setTextQuery = useCallback((next: string) => {
    setState((prev) => ({ ...prev, textQuery: next, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page: Math.max(1, page) }));
  }, []);

  const removeFilter = useCallback((field: keyof BaseSchemaFilters) => {
    setState((prev) => {
      const nextFilters = { ...prev.filters };
      delete nextFilters[field];
      return { ...prev, filters: nextFilters, page: 1 };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({ ...prev, filters: {}, textQuery: "", page: 1 }));
  }, []);

  const activeCount = useMemo(() => countActive(state.filters), [state.filters]);

  return {
    ...state,
    pageSize: DEFAULT_PAGE_SIZE,
    setFilters,
    setTextQuery,
    setPage,
    removeFilter,
    clearAll,
    activeCount,
  };
}

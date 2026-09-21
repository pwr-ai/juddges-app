// =============================================================================
// Filter-state hook for /search/extractions.
//
// Owns BaseSchemaFilters + textQuery + page + pageSize. Persists state in the
// URL using two query params:
//
//   ?q=<text>           — full-text query (mirrors RPC `text_query`)
//   ?f=<base64-json>    — opaque blob holding the structured filters
//   ?page=<n>           — 1-based page (default 1)
//   ?nl=<text>          — optional: the natural-language question a filter came from (Spec B)
//   ?view=stats         — statistics view instead of the list (#708; omitted for list)
//   ?n=<int>            — sample size for the statistics view (omitted for "all")
//   ?seed=<int>         — sampling seed, written whenever it is set
//   ?fields=a,b,c       — statistics fields (omitted when equal to the default set)
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

import { DEFAULT_AGGREGATE_FIELDS, isAggregableField } from "./aggregate-fields";

const DEFAULT_PAGE_SIZE = 25;

export type ResultView = "list" | "stats";

function sameFields(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function parseFields(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_AGGREGATE_FIELDS];
  const fields = raw.split(",").map((s) => s.trim()).filter(isAggregableField);
  return fields.length > 0 ? fields : [...DEFAULT_AGGREGATE_FIELDS];
}

function parseInt1(raw: string | null): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

interface FilterState {
  filters: BaseSchemaFilters;
  textQuery: string;
  page: number;
  nlQuestion?: string;
  /** Statistics view state (#708). */
  view: ResultView;
  sampleSize?: number;
  seed?: number;
  statsFields: string[];
}

interface UseExtractedDataFiltersResult extends FilterState {
  pageSize: number;
  setFilters: (next: BaseSchemaFilters) => void;
  setTextQuery: (next: string) => void;
  setPage: (page: number) => void;
  setNlQuestion: (next: string | undefined) => void;
  removeFilter: (field: keyof BaseSchemaFilters) => void;
  clearAll: () => void;
  /** Active filter count (excludes empty arrays / empty strings). */
  activeCount: number;
  setView: (view: ResultView) => void;
  setSampling: (sampleSize: number | undefined, seed?: number) => void;
  reshuffle: () => void;
  setStatsFields: (fields: string[]) => void;
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
// URL codec — the ONE place that writes ?f / ?q / ?page / ?nl. Used by this
// hook (/search/extractions and any page mounting it, e.g. /compare) and by
// href builders (document links, compare permalinks).
// -----------------------------------------------------------------------------

export interface FilterUrlState {
  filters: BaseSchemaFilters;
  textQuery?: string;
  page?: number;
  nlQuestion?: string;
  /** Statistics view state (#708). All optional; omitted at defaults. */
  view?: ResultView;
  sampleSize?: number;
  seed?: number;
  fields?: string[];
}

export function buildFilterSearchParams(state: FilterUrlState): URLSearchParams {
  const params = new URLSearchParams();
  const blob = encodeFilters(state.filters);
  if (blob) params.set("f", blob);
  const q = (state.textQuery ?? "").trim();
  if (q !== "") params.set("q", q);
  if ((state.page ?? 1) > 1) params.set("page", String(state.page));
  const nl = (state.nlQuestion ?? "").trim();
  if (nl !== "") params.set("nl", nl.slice(0, 255));
  if (state.view === "stats") params.set("view", "stats");
  if (state.sampleSize !== undefined) params.set("n", String(state.sampleSize));
  if (state.seed !== undefined) params.set("seed", String(state.seed));
  if (state.fields && !sameFields(state.fields, DEFAULT_AGGREGATE_FIELDS)) {
    params.set("fields", state.fields.join(","));
  }
  return params;
}

export function buildFilterHref(pathname: string, state: FilterUrlState, origin = ""): string {
  const qs = buildFilterSearchParams(state).toString();
  return `${origin}${pathname}${qs ? `?${qs}` : ""}`;
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
      nlQuestion: searchParams.get("nl") ?? undefined,
      view: searchParams.get("view") === "stats" ? "stats" : "list",
      sampleSize: parseInt1(searchParams.get("n")),
      seed: parseInt1(searchParams.get("seed")),
      statsFields: parseFields(searchParams.get("fields")),
    }),
    // intentionally only on mount; later updates use writeUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [state, setState] = useState<FilterState>(initial);

  const writeUrl = useCallback(
    (next: FilterState) => {
      const queryString = buildFilterSearchParams({ ...next, fields: next.statsFields }).toString();
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

  const setNlQuestion = useCallback((next: string | undefined) => {
    setState((prev) => ({ ...prev, nlQuestion: next }));
  }, []);

  const removeFilter = useCallback((field: keyof BaseSchemaFilters) => {
    setState((prev) => {
      const nextFilters = { ...prev.filters };
      delete nextFilters[field];
      return { ...prev, filters: nextFilters, page: 1 };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({ ...prev, filters: {}, textQuery: "", page: 1, nlQuestion: undefined }));
  }, []);

  const setView = useCallback((view: ResultView) => {
    setState((prev) => ({ ...prev, view }));
  }, []);

  const setSampling = useCallback((sampleSize: number | undefined, seed?: number) => {
    setState((prev) => ({ ...prev, sampleSize, seed: seed ?? prev.seed ?? newSeed() }));
  }, []);

  const reshuffle = useCallback(() => {
    setState((prev) => ({ ...prev, seed: newSeed() }));
  }, []);

  const setStatsFields = useCallback((fields: string[]) => {
    setState((prev) => ({ ...prev, statsFields: fields.filter(isAggregableField) }));
  }, []);

  const activeCount = useMemo(() => countActive(state.filters), [state.filters]);

  return {
    ...state,
    pageSize: DEFAULT_PAGE_SIZE,
    setFilters,
    setTextQuery,
    setPage,
    setNlQuestion,
    removeFilter,
    clearAll,
    activeCount,
    setView,
    setSampling,
    reshuffle,
    setStatsFields,
  };
}

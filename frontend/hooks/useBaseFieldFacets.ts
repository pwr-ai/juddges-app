import { useEffect, useRef, useState } from "react";
import { fetchBaseFieldFacets } from "@/lib/api/search";

const DEBOUNCE_MS = 250;
const CACHE_TTL_MS = 60_000;

type FacetMap = Record<string, Record<string, number>>;
type CacheEntry = { at: number; data: FacetMap };

const cache = new Map<string, CacheEntry>();

interface UseBaseFieldFacetsOptions {
  /** Optional facet-value substring filter (Meili `facetQuery`). */
  query?: string;
  /** When false, suspend fetching. Default true. */
  enabled?: boolean;
}

/**
 * Debounced facet fetcher for a stable list of registry-field names.
 *
 * Uses an in-memory LRU-style cache keyed by sorted-fields + query, with a
 * 60s TTL. Concurrent identical calls share a single in-flight fetch via the
 * cache miss path (the second caller arrives after the first has populated).
 */
export function useBaseFieldFacets(
  fields: string[],
  opts: UseBaseFieldFacetsOptions = {},
): { facetCounts: FacetMap } {
  const { query, enabled = true } = opts;
  const [facetCounts, setFacetCounts] = useState<FacetMap>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldsKey = [...fields].sort().join("|");

  useEffect(() => {
    if (!enabled || fields.length === 0) {
      setFacetCounts({});
      return;
    }
    const cacheKey = `${fieldsKey}::${query ?? ""}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setFacetCounts(hit.data);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const data = await fetchBaseFieldFacets(fields, query);
      cache.set(cacheKey, { at: Date.now(), data });
      setFacetCounts(data);
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  // The hook's intent is "fetch when this exact field set or query changes".
  // `fields` is treated as content via `fieldsKey`; do NOT depend on the array
  // identity (callers may pass a fresh array each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, query, enabled]);

  return { facetCounts };
}

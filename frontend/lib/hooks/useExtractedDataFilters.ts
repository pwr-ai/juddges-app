"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import type {
  FilterFieldConfig,
  FacetCount,
  ExtractedDataFilters,
} from "@/components/filters/ExtractedDataFilters";

interface UseExtractedDataFiltersOptions {
  syncToUrl?: boolean;
  initialFilters?: ExtractedDataFilters;
}

interface UseExtractedDataFiltersReturn {
  filters: ExtractedDataFilters;
  setFilters: (filters: ExtractedDataFilters) => void;
  updateFilter: (field: string, value: any) => void;
  removeFilter: (field: string) => void;
  clearFilters: () => void;
  activeFilterCount: number;
  isFiltering: boolean;
}

/**
 * Hook for managing extracted data filter state with optional URL sync.
 */
export function useExtractedDataFilters(
  options: UseExtractedDataFiltersOptions = {}
): UseExtractedDataFiltersReturn {
  const { syncToUrl = false, initialFilters = {} } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse filters from URL if syncing
  const getFiltersFromUrl = useCallback((): ExtractedDataFilters => {
    if (!syncToUrl) return initialFilters;

    const filters: ExtractedDataFilters = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith("filter_")) {
        const field = key.replace("filter_", "");
        // Handle array values (comma-separated)
        if (value.includes(",")) {
          filters[field] = value.split(",");
        } else if (value === "true" || value === "false") {
          filters[field] = value === "true";
        } else {
          filters[field] = value;
        }
      }
    });
    return Object.keys(filters).length > 0 ? filters : initialFilters;
  }, [searchParams, syncToUrl, initialFilters]);

  const [filters, setFiltersState] = useState<ExtractedDataFilters>(
    getFiltersFromUrl
  );

  // Update URL when filters change
  const updateUrl = useCallback(
    (newFilters: ExtractedDataFilters) => {
      if (!syncToUrl) return;

      const params = new URLSearchParams(searchParams.toString());

      // Remove old filter params
      Array.from(params.keys())
        .filter((key) => key.startsWith("filter_"))
        .forEach((key) => params.delete(key));

      // Add new filter params
      Object.entries(newFilters).forEach(([field, value]) => {
        if (value !== undefined) {
          const key = `filter_${field}`;
          if (Array.isArray(value)) {
            params.set(key, value.join(","));
          } else {
            params.set(key, String(value));
          }
        }
      });

      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, searchParams, syncToUrl]
  );

  const setFilters = useCallback(
    (newFilters: ExtractedDataFilters) => {
      setFiltersState(newFilters);
      updateUrl(newFilters);
    },
    [updateUrl]
  );

  const updateFilter = useCallback(
    (field: string, value: any) => {
      setFiltersState((prev) => {
        const newFilters = { ...prev };
        if (value === undefined) {
          delete newFilters[field];
        } else {
          newFilters[field] = value;
        }
        // Sync to URL if enabled
        updateUrl(newFilters);
        return newFilters;
      });
    },
    [updateUrl]
  );

  const removeFilter = useCallback(
    (field: string) => {
      updateFilter(field, undefined);
    },
    [updateFilter]
  );

  const clearFilters = useCallback(() => {
    setFilters({});
  }, [setFilters]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== undefined).length,
    [filters]
  );

  const isFiltering = activeFilterCount > 0;

  // Sync from URL on initial load
  useEffect(() => {
    if (syncToUrl) {
      const urlFilters = getFiltersFromUrl();
      if (Object.keys(urlFilters).length > 0) {
        setFiltersState(urlFilters);
      }
    }
  }, [syncToUrl, getFiltersFromUrl]);

  return {
    filters,
    setFilters,
    updateFilter,
    removeFilter,
    clearFilters,
    activeFilterCount,
    isFiltering,
  };
}

interface UseFilterOptionsReturn {
  filterConfigs: FilterFieldConfig[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching filter field configurations from the API.
 */
export function useFilterOptions(): UseFilterOptionsReturn {
  const [filterConfigs, setFilterConfigs] = useState<FilterFieldConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/extractions/base-schema/filter-options");
      if (!response.ok) {
        throw new Error("Failed to fetch filter options");
      }
      const data = await response.json();
      setFilterConfigs(data.fields || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  return {
    filterConfigs,
    isLoading,
    error,
    refetch: fetchOptions,
  };
}

interface UseFacetCountsOptions {
  fields: string[];
  enabled?: boolean;
}

interface UseFacetCountsReturn {
  facetCounts: Record<string, FacetCount[]>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching facet counts for multiple fields.
 */
export function useFacetCounts(
  options: UseFacetCountsOptions
): UseFacetCountsReturn {
  const { fields, enabled = true } = options;
  const [facetCounts, setFacetCounts] = useState<Record<string, FacetCount[]>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!enabled || fields.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch counts for all fields in parallel
      const results = await Promise.all(
        fields.map(async (field) => {
          const response = await fetch(
            `/api/extractions/base-schema/facets/${encodeURIComponent(field)}`
          );
          if (!response.ok) {
            console.warn(`Failed to fetch facet counts for ${field}`);
            return { field, counts: [] };
          }
          const data = await response.json();
          return { field, counts: data.counts || [] };
        })
      );

      const countsMap: Record<string, FacetCount[]> = {};
      results.forEach(({ field, counts }) => {
        countsMap[field] = counts;
      });
      setFacetCounts(countsMap);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [fields, enabled]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return {
    facetCounts,
    isLoading,
    error,
    refetch: fetchCounts,
  };
}

interface UseFilteredDocumentsOptions {
  filters: ExtractedDataFilters;
  textQuery?: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

interface FilteredDocument {
  document_id: string;
  supabase_document_id: number;
  title: string;
  date_issued: string;
  extracted_data: Record<string, any>;
  jurisdiction: string;
}

interface UseFilteredDocumentsReturn {
  documents: FilteredDocument[];
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching documents filtered by extracted data.
 */
export function useFilteredDocuments(
  options: UseFilteredDocumentsOptions
): UseFilteredDocumentsReturn {
  const {
    filters,
    textQuery,
    limit = 50,
    offset = 0,
    enabled = true,
  } = options;

  const [documents, setDocuments] = useState<FilteredDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/extractions/base-schema/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters,
          text_query: textQuery,
          limit,
          offset,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to filter documents");
      }

      const data = await response.json();
      setDocuments(data.documents || []);
      setTotalCount(data.total_count || 0);
      setHasMore(data.has_more || false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, [filters, textQuery, limit, offset, enabled]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    totalCount,
    hasMore,
    isLoading,
    error,
    refetch: fetchDocuments,
  };
}

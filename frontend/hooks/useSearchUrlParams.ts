import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { DocumentType } from '@/types/search';
import { useSearchStore } from '@/lib/store/searchStore';
import logger from '@/lib/logger';

const urlParamsLogger = logger.child('useSearchUrlParams');

interface UseSearchUrlParamsOptions {
  mounted: boolean;
  urlParamsProcessed: boolean;
  setUrlParamsProcessed: (processed: boolean) => void;
  hasPerformedSearch: boolean;
  isSearching: boolean;
  onSearchFromUrl?: (pageFromUrl: number | null) => Promise<void>;
}

/**
 * Hook for managing URL parameter synchronization with search state
 * Handles reading from URL on mount and updating URL when state changes
 */
export function useSearchUrlParams({
  mounted,
  urlParamsProcessed,
  setUrlParamsProcessed,
  hasPerformedSearch,
  isSearching,
  onSearchFromUrl,
}: UseSearchUrlParamsOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const updatingUrlRef = useRef(false);
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const {
    query,
    documentTypes,
    selectedLanguages,
    searchType,
    currentPage,
    pageSize,
    filters,
    setQuery,
    setDocumentTypes,
    setSelectedLanguages,
    setSearchType,
    setCurrentPage,
    setPageSize,
    setSearchMetadata,
    clearChunksCache,
    setError,
  } = useSearchStore();

  /**
   * Updates URL with current search parameters
   */
  const updateUrlParams = useCallback(
    (skipUrlUpdate = false, forceUpdate = false, immediate = false) => {
      // Skip URL update if we're still processing initial URL params or if no search has been performed
      // forceUpdate bypasses the hasPerformedSearch check (used after search completes)
      // Also skip if currently searching to prevent loops
      if (!mounted || !urlParamsProcessed || skipUrlUpdate) return;
      if (!hasPerformedSearch && !forceUpdate) return;
      if (isSearching && !forceUpdate) return; // Don't update URL while searching

      // Clear any pending timeout
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
        urlUpdateTimeoutRef.current = null;
      }

      const performUpdate = () => {
        // Prevent updates if we're already updating
        if (updatingUrlRef.current) {
          return;
        }

        const params = new URLSearchParams();

        // Add query if present
        if (query.trim()) {
          params.set('q', encodeURIComponent(query.trim()));
        }

        // Add document types
        if (documentTypes.length > 0) {
          if (documentTypes.length === 1) {
            params.set('type', documentTypes[0]);
          } else {
            params.set('type', documentTypes.join(','));
          }
        }

        // Add languages
        if (selectedLanguages.size > 0) {
          params.set('lang', Array.from(selectedLanguages).join(','));
        }

        // Add search mode
        if (searchType) {
          params.set('mode', searchType);
        }

        // Add pagination
        if (currentPage > 1) {
          params.set('page', currentPage.toString());
        }
        if (pageSize !== 10) {
          // Only add if not default
          params.set('pageSize', pageSize.toString());
        }

        // Add filters
        if (filters.keywords.size > 0) {
          params.set('keywords', Array.from(filters.keywords).join(','));
        }
        if (filters.legalConcepts.size > 0) {
          params.set('legalConcepts', Array.from(filters.legalConcepts).join(','));
        }
        if (filters.documentTypes.size > 0) {
          params.set('filterTypes', Array.from(filters.documentTypes).join(','));
        }
        if (filters.issuingBodies.size > 0) {
          params.set('issuingBodies', Array.from(filters.issuingBodies).join(','));
        }
        if (filters.dateFrom) {
          params.set('dateFrom', filters.dateFrom.toISOString().split('T')[0]);
        }
        if (filters.dateTo) {
          params.set('dateTo', filters.dateTo.toISOString().split('T')[0]);
        }
        // Advanced filters
        if (filters.jurisdictions.size > 0) {
          params.set('jurisdictions', Array.from(filters.jurisdictions).join(','));
        }
        if (filters.courtLevels.size > 0) {
          params.set('courtLevels', Array.from(filters.courtLevels).join(','));
        }
        if (filters.legalDomains.size > 0) {
          params.set('legalDomains', Array.from(filters.legalDomains).join(','));
        }
        // Custom metadata filters (serialized as JSON)
        if (Object.keys(filters.customMetadata).length > 0) {
          params.set('customMeta', JSON.stringify(filters.customMetadata));
        }

        // Build new URL
        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

        // Only update if URL actually changed
        if (lastUrlRef.current === newUrl) {
          return;
        }

        // Mark that we're updating to prevent loops
        updatingUrlRef.current = true;
        lastUrlRef.current = newUrl;

        // Update URL without adding to history (replace current entry)
        router.replace(newUrl, { scroll: false });

        // Reset the flag after a short delay to allow URL to update
        setTimeout(() => {
          updatingUrlRef.current = false;
        }, 100);
      };

      // Debounce URL updates when query changes (unless immediate is true)
      // This prevents URL updates on every keystroke, which can trigger unnecessary searches
      if (immediate || forceUpdate) {
        performUpdate();
      } else {
        // Debounce by 500ms for query changes
        urlUpdateTimeoutRef.current = setTimeout(performUpdate, 500);
      }
    },
    [
      mounted,
      urlParamsProcessed,
      hasPerformedSearch,
      isSearching,
      query,
      documentTypes,
      selectedLanguages,
      searchType,
      currentPage,
      pageSize,
      filters,
      pathname,
      router,
    ]
  );

  /**
   * Reads URL parameters on initial load and updates search state
   */
  useEffect(() => {
    if (!mounted || urlParamsProcessed) return;

    // Set flag to prevent URL updates while reading from URL
    updatingUrlRef.current = true;

    const queryParam = searchParams.get('q');
    const typeParam = searchParams.get('type');
    const langParam = searchParams.get('lang');
    const modeParam = searchParams.get('mode');
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const keywordsParam = searchParams.get('keywords');
    const legalConceptsParam = searchParams.get('legalConcepts');
    const filterTypesParam = searchParams.get('filterTypes');
    const issuingBodiesParam = searchParams.get('issuingBodies');
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const jurisdictionsParam = searchParams.get('jurisdictions');
    const courtLevelsParam = searchParams.get('courtLevels');
    const legalDomainsParam = searchParams.get('legalDomains');
    const customMetaParam = searchParams.get('customMeta');

    // If no parameters are present, clear everything
    if (
      !queryParam &&
      !typeParam &&
      !langParam &&
      !modeParam &&
      !pageParam &&
      !pageSizeParam &&
      !keywordsParam &&
      !legalConceptsParam &&
      !filterTypesParam &&
      !issuingBodiesParam &&
      !dateFromParam &&
      !dateToParam &&
      !jurisdictionsParam &&
      !courtLevelsParam &&
      !legalDomainsParam &&
      !customMetaParam
    ) {
      // Clear all search state
      setQuery('');
      setSearchMetadata([], 0, false);
      clearChunksCache();
      setError(null);
      setUrlParamsProcessed(true);
      updatingUrlRef.current = false;
      return;
    }

    let shouldSearch = false;
    let pageFromUrl: number | null = null;

    // Set query from URL parameter
    if (queryParam) {
      setQuery(decodeURIComponent(queryParam));
      shouldSearch = true;
    }

    // Set document types from URL parameter (supports single or comma-separated)
    if (typeParam) {
      const types = typeParam
        .split(',')
        .filter((t) => Object.values(DocumentType).includes(t.trim() as DocumentType))
        .map((t) => t.trim() as DocumentType);
      if (types.length > 0) {
        setDocumentTypes(types);
      }
    }

    // Set language from URL parameter
    if (langParam) {
      const langs = langParam
        .split(',')
        .filter((l) => l.trim())
        .map((l) => (l === 'en' ? 'uk' : l));
      if (langs.length > 0) {
        setSelectedLanguages(new Set(langs));
      }
    }

    // Set search mode from URL parameter
    if (modeParam && (modeParam === 'rabbit' || modeParam === 'thinking')) {
      setSearchType(modeParam);
    }

    // Set pagination from URL parameters - store page number to restore after search
    if (pageParam) {
      const page = parseInt(pageParam, 10);
      if (!isNaN(page) && page > 0) {
        pageFromUrl = page;
        setCurrentPage(page);
      }
    }
    if (pageSizeParam) {
      const size = parseInt(pageSizeParam, 10);
      if (!isNaN(size) && size > 0) {
        setPageSize(size);
      }
    }

    // Set filters from URL parameters - batch updates to avoid multiple filterVersion increments
    const currentState = useSearchStore.getState();
    const newFilters = {
      keywords: new Set<string>(),
      legalConcepts: new Set<string>(),
      documentTypes: new Set<string>(),
      issuingBodies: new Set<string>(),
      languages: currentState.filters.languages, // Preserve existing languages filter
      dateFrom: undefined as Date | undefined,
      dateTo: undefined as Date | undefined,
      jurisdictions: new Set<string>(),
      courtLevels: new Set<string>(),
      legalDomains: new Set<string>(),
      customMetadata: {} as Record<string, string[]>,
    };

    if (keywordsParam) {
      const keywords = keywordsParam.split(',').filter((k) => k.trim());
      newFilters.keywords = new Set(keywords);
    }
    if (legalConceptsParam) {
      const concepts = legalConceptsParam.split(',').filter((c) => c.trim());
      newFilters.legalConcepts = new Set(concepts);
    }
    if (filterTypesParam) {
      const types = filterTypesParam.split(',').filter((t) => t.trim());
      newFilters.documentTypes = new Set(types);
    }
    if (issuingBodiesParam) {
      const bodies = issuingBodiesParam.split(',').filter((b) => b.trim());
      newFilters.issuingBodies = new Set(bodies);
    }
    if (dateFromParam) {
      const date = new Date(dateFromParam);
      if (!isNaN(date.getTime())) {
        newFilters.dateFrom = date;
      }
    }
    if (dateToParam) {
      const date = new Date(dateToParam);
      if (!isNaN(date.getTime())) {
        newFilters.dateTo = date;
      }
    }
    if (jurisdictionsParam) {
      const jurisdictions = jurisdictionsParam.split(',').filter((j) => j.trim());
      newFilters.jurisdictions = new Set(jurisdictions);
    }
    if (courtLevelsParam) {
      const levels = courtLevelsParam.split(',').filter((l) => l.trim());
      newFilters.courtLevels = new Set(levels);
    }
    if (legalDomainsParam) {
      const domains = legalDomainsParam.split(',').filter((d) => d.trim());
      newFilters.legalDomains = new Set(domains);
    }
    if (customMetaParam) {
      try {
        const parsed = JSON.parse(customMetaParam);
        if (typeof parsed === 'object' && parsed !== null) {
          newFilters.customMetadata = parsed;
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Apply all filters at once if any filter params were provided
    if (
      keywordsParam ||
      legalConceptsParam ||
      filterTypesParam ||
      issuingBodiesParam ||
      dateFromParam ||
      dateToParam ||
      jurisdictionsParam ||
      courtLevelsParam ||
      legalDomainsParam ||
      customMetaParam
    ) {
      useSearchStore.setState((state) => ({
        filters: newFilters,
        filterVersion: state.filterVersion + 1,
      }));
    }

    // Mark as processed and allow URL updates again
    setUrlParamsProcessed(true);
    updatingUrlRef.current = false;

    // Trigger search if query was provided
    if (shouldSearch && queryParam && onSearchFromUrl) {
      // Small delay to ensure state is updated
      setTimeout(async () => {
        try {
          await onSearchFromUrl(pageFromUrl);
        } catch (error) {
          // Handle search error if needed
          urlParamsLogger.error('Error during search from URL', error);
          updatingUrlRef.current = false;
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, searchParams, urlParamsProcessed]);

  /**
   * Handles URL changes after initial processing (e.g., browser back/forward)
   */
  useEffect(() => {
    if (!mounted || !urlParamsProcessed || isSearching || updatingUrlRef.current) return; // Don't process URL changes while searching or updating

    // Build current URL from searchParams to compare with lastUrlRef
    const params = new URLSearchParams();
    Array.from(searchParams.keys()).forEach((key) => {
      params.set(key, searchParams.get(key) || '');
    });
    const currentUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

    // If this is the URL we just set, ignore it (prevent loop)
    if (lastUrlRef.current === currentUrl) {
      return;
    }

    // Check if any URL parameters exist
    const hasAnyParams = Array.from(searchParams.keys()).length > 0;

    // If no parameters and we have results or search was performed, clear everything
    if (!hasAnyParams && (query || hasPerformedSearch)) {
      setQuery('');
      setSearchMetadata([], 0, false);
      clearChunksCache();
      setError(null);
      lastUrlRef.current = currentUrl; // Update ref to prevent re-triggering
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, mounted, urlParamsProcessed, isSearching, pathname]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
      }
    };
  }, []);

  return {
    updateUrlParams,
    updatingUrlRef,
  };
}





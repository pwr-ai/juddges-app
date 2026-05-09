import { create } from 'zustand';
import { SearchResult, SearchDocument, SearchChunk, LegalDocumentMetadata } from '@/types/search';
import { PaginationMetadata } from '@/lib/api';
import { parseISO, isValid } from 'date-fns';
import logger from '@/lib/logger';

const storeLogger = logger.child('searchStore');

type DateRange = { from?: Date; to?: Date } | null;

interface SearchFilters {
  keywords: Set<string>;
  legalConcepts: Set<string>;
  issuingBodies: Set<string>;
  languages: Set<string>;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  // Advanced filters
  jurisdictions: Set<string>;
  courtLevels: Set<string>;
  legalDomains: Set<string>;
  customMetadata: Record<string, string[]>;
}

interface AvailableFilters {
  keywords: string[];
  legalConcepts: string[];
  issuingBodies: string[];
  languages: string[];
  // Advanced filters
  jurisdictions: string[];
  courtLevels: string[];
  legalDomains: string[];
  customMetadataKeys: string[];
}

interface SearchState {
  // Search params
  query: string;
  selectedLanguages: Set<string>;
  searchType: "rabbit" | "thinking";

  // Pagination
  currentPage: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;

  // Results
  searchResults: SearchResult | null;
  isSearching: boolean;
  error: string | null;

  // New optimized search state
  searchMetadata: LegalDocumentMetadata[];
  totalResultsCount: number;
  isCapped: boolean;
  chunksCache: Record<string, SearchChunk[]>; // Use plain object instead of Map for Zustand
  loadingChunks: string[]; // Use array instead of Set for Zustand

  // Progressive loading / infinite scroll state
  paginationMetadata: PaginationMetadata | null;
  isLoadingMore: boolean;
  cachedEstimatedTotal: number | null; // Persists across load-more calls

  // Filters
  filters: SearchFilters;
  availableFilters: AvailableFilters | null;
  // Force re-render when filters change (Zustand shallow equality issue with Date objects)
  filterVersion: number;

  // Dialog
  selectedDoc: SearchDocument | null;
  selectedChunks: SearchChunk[];
  isDialogOpen: boolean;
  showSaveAllPopover: boolean;

  // Selection
  selectedDocumentIds: Set<string>;

  // Actions
  setQuery: (query: string) => void;
  setSelectedLanguages: (selectedLanguages: Set<string>) => void;
  setSearchResults: (results: SearchResult | null) => void;
  setIsSearching: (isSearching: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setTotalResults: (total: number) => void;
  setTotalPages: (pages: number) => void;
  toggleFilter: (filterType: keyof SearchFilters, value: string) => void;
  setDateFilter: (filterType: "dateFrom" | "dateTo", date: Date | undefined) => void;
  toggleCustomMetadataFilter: (key: string, value: string) => void;
  clearCustomMetadataFilter: (key: string) => void;
  resetFilters: () => void;
  openDocumentDialog: (doc: SearchDocument, chunks: SearchChunk[]) => void;
  closeDocumentDialog: () => void;
  setSelectedDoc: (doc: SearchDocument | null) => void;
  setSelectedChunks: (chunks: SearchChunk[]) => void;
  setIsDialogOpen: (open: boolean) => void;
  setShowSaveAllPopover: (show: boolean) => void;
  setSearchType: (type: "rabbit" | "thinking") => void;
  loadState: () => void;
  saveState: () => void;

  // Computed
  getFilteredDocuments: () => SearchDocument[];
  getActiveFilterCount: () => number;
  getFilteredDocumentsCount: () => number;

  // Selection actions
  toggleDocumentSelection: (documentId: string) => void;
  selectAllDocuments: () => void;
  clearSelection: () => void;
  getSelectedDocuments: () => SearchDocument[];
  getSelectedDocumentCount: () => number;

  // New optimized search actions
  setSearchMetadata: (metadata: LegalDocumentMetadata[], total: number, capped: boolean) => void;
  setChunksForDocuments: (documentId: string, chunks: SearchChunk[]) => void;
  clearChunksCache: () => void;
  addLoadingChunk: (documentId: string) => void;
  removeLoadingChunk: (documentId: string) => void;

  // Progressive loading actions
  setPaginationMetadata: (metadata: PaginationMetadata | null) => void;
  setIsLoadingMore: (loading: boolean) => void;
  appendSearchMetadata: (metadata: LegalDocumentMetadata[]) => void;
  resetSearch: () => void;

  // New metadata filtering functions
  getFilteredMetadata: () => LegalDocumentMetadata[];
  getFilteredMetadataCount: () => number;
  getAvailableFiltersFromMetadata: () => AvailableFilters;

  // New properties
  isFiltersDialogOpen: boolean;
  isDocumentDialogOpen: boolean;
  selectedDocument: SearchDocument | null;
  handleDateChange: (dates: DateRange | null) => void;
  setFilters: (filters: SearchFilters) => void;
  setAvailableFilters: (availableFilters: AvailableFilters | null) => void;
  toggleFiltersDialog: () => void;
  toggleDocumentDialog: () => void;
  setSelectedDocument: (document: SearchDocument | null) => void;

  // Feedback votes — persists for the current session
  feedbackVotes: Record<string, 'relevant' | 'not_relevant'>;
  setFeedbackVote: (documentId: string, rating: 'relevant' | 'not_relevant' | null) => void;
}

// Helper functions for serialization
const setToArray = (set: Set<string>): string[] => Array.from(set);
const arrayToSet = (array: string[] | undefined): Set<string> => new Set(array || []);

// Normalize language codes to avoid duplicates (en -> uk)
// Database stores English as "uk", so we normalize "en" to "uk"
const DEFAULT_LANGUAGE = "pl";

const normalizeLanguages = (languages: Set<string>): Set<string> => {
  const normalized = new Set<string>();
  for (const lang of languages) {
    // CRITICAL: Always lowercase to prevent duplicates like 'UK' and 'uk'
    const lowercased = lang.toLowerCase();
    // Convert "en" to "uk" (database standard)
    if (lowercased === "en") {
      normalized.add("uk");
    } else {
      normalized.add(lowercased);
    }
  }
  if (normalized.size === 0) {
    normalized.add(DEFAULT_LANGUAGE);
  }
  return normalized;
};

// Create the store with a simple implementation
export const useSearchStore = create<SearchState>()((set, get) => ({
  // Search params
  query: "",
  selectedLanguages: new Set(["uk", "pl"]),
  searchType: "thinking",

  // Pagination
  currentPage: 1,
  pageSize: 20,
  totalResults: 0,
  totalPages: 0,

  // Results
  searchResults: null,
  isSearching: false,
  error: null,

  // New optimized search state
  searchMetadata: [],
  totalResultsCount: 0,
  isCapped: false,
  chunksCache: {}, // Use plain object instead of Map
  loadingChunks: [], // Use array instead of Set

  // Progressive loading / infinite scroll state
  paginationMetadata: null,
  isLoadingMore: false,
  cachedEstimatedTotal: null,

  // Filters
  filters: {
    keywords: new Set<string>(),
    legalConcepts: new Set<string>(),
    issuingBodies: new Set<string>(),
    languages: new Set<string>(),
    dateFrom: undefined,
    dateTo: undefined,
    jurisdictions: new Set<string>(),
    courtLevels: new Set<string>(),
    legalDomains: new Set<string>(),
    customMetadata: {},
  },

  availableFilters: null,
  filterVersion: 0,

  // Dialog
  selectedDoc: null,
  selectedChunks: [],
  isDialogOpen: false,
  showSaveAllPopover: false,

  // Selection
  selectedDocumentIds: new Set<string>(),

  // Feedback votes (session only, not persisted to localStorage)
  feedbackVotes: {},

  // Actions
  setQuery: (query: string) => set({ query }),
  setSelectedLanguages: (selectedLanguages: Set<string>) => {
    const normalized = normalizeLanguages(new Set(selectedLanguages));
    if (normalized.size === 0) {
      normalized.add("pl");
      normalized.add("uk");
    }
    set({ selectedLanguages: normalized });
  },
  setSearchResults: (results: SearchResult | null) => {
    set({
      searchResults: results,
      currentPage: 1, // Reset to first page when new results come in
      selectedDocumentIds: new Set<string>() // Clear selection on new search
    });
    // After setting results, recalculate pagination based on filtered documents
    const state = get();
    const filteredCount = state.getFilteredDocumentsCount();
    const totalPages = Math.ceil(filteredCount / state.pageSize);
    set({
      totalResults: filteredCount,
      totalPages
    });
  },
  setIsSearching: (isSearching: boolean) => set({ isSearching }),
  setError: (error: string | null) => set({ error }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setPageSize: (size: number) => {
    const totalResults = get().totalResults;
    const totalPages = Math.ceil(totalResults / size);
    set({ pageSize: size, totalPages, currentPage: 1 });
  },
  setTotalResults: (total: number) => set({ totalResults: total }),
  setTotalPages: (pages: number) => set({ totalPages: pages }),

  toggleFilter: (filterType: keyof SearchFilters, value: string) => {
    // OPTIMIZED: Single state update to prevent multiple re-renders
    // Previously this had TWO set() calls which caused freezing with large datasets
    set((state) => {
      // Get the current filter set, ensuring it's a Set
      const currentFilterSet = state.filters[filterType];
      const filterSet = currentFilterSet instanceof Set
        ? currentFilterSet
        : new Set<string>();

      // Create new Set with immutable pattern - toggle the value
      const newFilterSet = new Set(filterSet);
      if (newFilterSet.has(value)) {
        newFilterSet.delete(value);
      } else {
        newFilterSet.add(value);
      }

      // Create new filters object with the updated Set
      const newFilters = {
        ...state.filters,
        [filterType]: newFilterSet
      };

      // Calculate filtered count WITHIN the same state update to avoid double render
      // Use searchMetadata for new optimized flow, fallback to searchResults
      let filteredCount = 0;
      if (state.searchMetadata && state.searchMetadata.length > 0) {
        // Simplified count - let getFilteredMetadataCount handle full filtering
        filteredCount = state.searchMetadata.length;
      } else if (state.searchResults) {
        filteredCount = state.searchResults.documents.length;
      }
      const totalPages = Math.ceil(filteredCount / state.pageSize);

      return {
        filters: newFilters,
        currentPage: 1, // Reset to page 1 when filters change
        filterVersion: state.filterVersion + 1, // Increment to force re-render
        totalResults: filteredCount,
        totalPages
      };
    });
  },

  setDateFilter: (filterType: "dateFrom" | "dateTo", date: Date | undefined) => {
    // OPTIMIZED: Single state update to prevent multiple re-renders
    set((state) => {
      const newFilters = { ...state.filters, [filterType]: date };

      // Calculate filtered count WITHIN the same state update to avoid double render
      let filteredCount = 0;
      if (state.searchMetadata && state.searchMetadata.length > 0) {
        filteredCount = state.searchMetadata.length;
      } else if (state.searchResults) {
        filteredCount = state.searchResults.documents.length;
      }
      const totalPages = Math.ceil(filteredCount / state.pageSize);

      return {
        filters: newFilters,
        currentPage: 1, // Reset to page 1 when filters change
        filterVersion: state.filterVersion + 1, // Increment to force re-render
        totalResults: filteredCount,
        totalPages
      };
    });
  },

  toggleCustomMetadataFilter: (key: string, value: string) => {
    set((state) => {
      const currentValues = state.filters.customMetadata[key] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];

      const newCustomMetadata = { ...state.filters.customMetadata };
      if (newValues.length === 0) {
        delete newCustomMetadata[key];
      } else {
        newCustomMetadata[key] = newValues;
      }

      const newFilters = { ...state.filters, customMetadata: newCustomMetadata };

      let filteredCount = 0;
      if (state.searchMetadata && state.searchMetadata.length > 0) {
        filteredCount = state.searchMetadata.length;
      } else if (state.searchResults) {
        filteredCount = state.searchResults.documents.length;
      }
      const totalPages = Math.ceil(filteredCount / state.pageSize);

      return {
        filters: newFilters,
        currentPage: 1,
        filterVersion: state.filterVersion + 1,
        totalResults: filteredCount,
        totalPages,
      };
    });
  },

  clearCustomMetadataFilter: (key: string) => {
    set((state) => {
      const newCustomMetadata = { ...state.filters.customMetadata };
      delete newCustomMetadata[key];

      const newFilters = { ...state.filters, customMetadata: newCustomMetadata };

      return {
        filters: newFilters,
        currentPage: 1,
        filterVersion: state.filterVersion + 1,
      };
    });
  },

  resetFilters: () => {
    // OPTIMIZED: Single state update to prevent multiple re-renders
    set((state) => {
      // Calculate filtered count WITHIN the same state update
      let filteredCount = 0;
      if (state.searchMetadata && state.searchMetadata.length > 0) {
        filteredCount = state.searchMetadata.length;
      } else if (state.searchResults) {
        filteredCount = state.searchResults.documents.length;
      }
      const totalPages = Math.ceil(filteredCount / state.pageSize);

      return {
        filters: {
          keywords: new Set<string>(),
          legalConcepts: new Set<string>(),
          issuingBodies: new Set<string>(),
          languages: new Set<string>(),
          dateFrom: undefined,
          dateTo: undefined,
          jurisdictions: new Set<string>(),
          courtLevels: new Set<string>(),
          legalDomains: new Set<string>(),
          customMetadata: {},
        },
        currentPage: 1, // Reset to page 1 when filters are reset
        filterVersion: state.filterVersion + 1, // Increment to force re-render
        totalResults: filteredCount,
        totalPages
      };
    });
  },

  openDocumentDialog: (doc: SearchDocument, chunks: SearchChunk[]) => set({
    selectedDoc: doc,
    selectedChunks: chunks,
    isDialogOpen: true
  }),

  closeDocumentDialog: () => set({
    selectedDoc: null,
    selectedChunks: [],
    isDialogOpen: false
  }),

  setSelectedDoc: (doc: SearchDocument | null) => set({ selectedDoc: doc }),

  setSelectedChunks: (chunks: SearchChunk[]) => set({ selectedChunks: chunks }),

  setIsDialogOpen: (open: boolean) => set({ isDialogOpen: open }),

  setShowSaveAllPopover: (show: boolean) => set({ showSaveAllPopover: show }),

  loadState: () => {
    try {
      const savedState = localStorage.getItem('searchState');
      if (savedState) {
        const parsedState = JSON.parse(savedState);

        // Version check - if old format, skip loading and use defaults
        // This helps with migration when we change defaults
        const stateVersion = parsedState.stateVersion || 1;
        const currentVersion = 2; // Increment this when you need to reset user state

        if (stateVersion < currentVersion) {
          storeLogger.debug('Outdated state version, using defaults', {
            savedVersion: stateVersion,
            currentVersion
          });
          localStorage.removeItem('searchState');
          return;
        }

        // Get current state to preserve any existing filters (especially date filters)
        const currentState = get();

        // Convert arrays back to Sets for the filters
        // CRITICAL: Merge with existing filters to preserve user-set date filters
        const loadedFilters = {
          keywords: arrayToSet(parsedState.filters?.keywords),
          legalConcepts: arrayToSet(parsedState.filters?.legalConcepts),
          issuingBodies: arrayToSet(parsedState.filters?.issuingBodies),
          languages: arrayToSet(parsedState.filters?.languages),
          dateFrom: parsedState.filters?.dateFrom ? new Date(parsedState.filters.dateFrom) : undefined,
          dateTo: parsedState.filters?.dateTo ? new Date(parsedState.filters.dateTo) : undefined,
          jurisdictions: arrayToSet(parsedState.filters?.jurisdictions),
          courtLevels: arrayToSet(parsedState.filters?.courtLevels),
          legalDomains: arrayToSet(parsedState.filters?.legalDomains),
          customMetadata: parsedState.filters?.customMetadata || {},
        };

        // Merge loaded filters with existing filters
        // Preserve existing date filters if they're set (user might have just set them)
        const mergedFilters = {
          ...loadedFilters,
          // Preserve existing date filters if they exist and loaded ones don't
          dateFrom: currentState.filters.dateFrom || loadedFilters.dateFrom,
          dateTo: currentState.filters.dateTo || loadedFilters.dateTo,
        };

        // Convert array back to Set for selectedLanguages and normalize
        let selectedLanguages = normalizeLanguages(arrayToSet(parsedState.selectedLanguages));

        // Ensure at least one language is selected, default to both languages if empty
        if (selectedLanguages.size === 0) {
          selectedLanguages = new Set(["uk", "pl"]);
        }

        // Convert array back to Set for selectedDocumentIds
        const selectedDocumentIds = arrayToSet(parsedState.selectedDocumentIds);

        set({
          ...parsedState,
          filters: mergedFilters,
          selectedLanguages,
          selectedDocumentIds,
          // Default ignoreUnknownType to true if not present (for backward compatibility)
          ignoreUnknownType: parsedState.ignoreUnknownType !== undefined ? parsedState.ignoreUnknownType : true,
          // Don't restore these states
          isSearching: false,
          error: null,
          isDialogOpen: false,
          showSaveAllPopover: false,
        });

        storeLogger.debug('State loaded from localStorage', {
          query: parsedState.query,
          selectedLanguages: Array.from(selectedLanguages),
          dateFrom: mergedFilters.dateFrom?.toISOString(),
          dateTo: mergedFilters.dateTo?.toISOString(),
        });
      }
    } catch (error) {
      storeLogger.error('Error loading search state from localStorage', error);
    }
  },

  saveState: () => {
    try {
      const state = get();
      let languagesToSave = setToArray(state.selectedLanguages);
      if (languagesToSave.length === 0) languagesToSave = ["pl", "uk"];

      const stateToSave = {
        stateVersion: 2,
        ...state,
        filters: {
          ...state.filters,
          keywords: setToArray(state.filters.keywords),
          legalConcepts: setToArray(state.filters.legalConcepts),
          issuingBodies: setToArray(state.filters.issuingBodies),
          languages: setToArray(state.filters.languages),
          dateFrom: state.filters.dateFrom?.toISOString() || undefined,
          dateTo: state.filters.dateTo?.toISOString() || undefined,
          jurisdictions: setToArray(state.filters.jurisdictions),
          courtLevels: setToArray(state.filters.courtLevels),
          legalDomains: setToArray(state.filters.legalDomains),
          customMetadata: state.filters.customMetadata,
        },
        selectedLanguages: languagesToSave,
        selectedDocumentIds: setToArray(state.selectedDocumentIds),
        searchResults: null,
        isSearching: false,
        error: null,
        selectedDoc: null,
        selectedChunks: [],
        isDialogOpen: false,
        showSaveAllPopover: false,
      };
      localStorage.setItem('searchState', JSON.stringify(stateToSave));
    } catch (error) {
      storeLogger.error('Error saving search state to localStorage', error);
    }
  },

  // Computed data
  getFilteredDocuments: () => {
    const { searchResults, filters, currentPage, pageSize } = get();
    if (!searchResults) return [];

    const filtered = searchResults.documents.filter(doc => {
      // Set filters
      if (filters.keywords.size > 0 &&
          !doc.keywords?.some(keyword => filters.keywords.has(keyword))) return false;

      if (filters.legalConcepts.size > 0 &&
          !doc.legal_concepts?.some(concept => filters.legalConcepts.has(concept.concept_name))) return false;

      if (filters.issuingBodies.size > 0 &&
          !filters.issuingBodies.has(doc.issuing_body?.name || '')) return false;

      if (filters.languages && filters.languages.size > 0 &&
          !filters.languages.has(doc.language || '')) return false;

      // Date filtering - compare only the date part (ignore time)
      if (filters.dateFrom || filters.dateTo) {
        // Fallback order for dates:
        // 1) date_issued (canonical)
        // 2) publication_date (judgments)
        // 3) issue_date / interpretation_date (tax interpretations & legacy ETL)
        const meta: Record<string, unknown> = doc.metadata || {};
        const docDateStr: string | null =
          doc.date_issued ||
          (typeof meta.publication_date === 'string' ? meta.publication_date : null) ||
          (typeof meta.issue_date === 'string' ? meta.issue_date : null) ||
          (typeof meta.interpretation_date === 'string' ? meta.interpretation_date : null) ||
          null;

        // If document has no date, EXCLUDE it when date filter is active
        if (!docDateStr || docDateStr.trim() === '') {
          return false;
        }

        // Try to parse the date
        let docDate: Date;
        try {
          // Try parsing as ISO string first
          docDate = parseISO(docDateStr);

          // If parseISO fails, try new Date
          if (!isValid(docDate)) {
            docDate = new Date(docDateStr);
          }
        } catch {
          // If parsing fails completely, EXCLUDE the document
          return false;
        }

        // If still invalid, EXCLUDE the document
        if (!isValid(docDate)) {
          return false;
        }

        // Normalize dates to start of day for consistent comparison
        // Extract date components (year, month, day) for comparison
        const docYear = docDate.getUTCFullYear();
        const docMonth = docDate.getUTCMonth();
        const docDay = docDate.getUTCDate();

        // Check date_from: document date should be >= dateFrom
        if (filters.dateFrom) {
          // Get the calendar date components from the filter (what the user selected)
          const filterYear = filters.dateFrom.getFullYear();
          const filterMonth = filters.dateFrom.getMonth();
          const filterDay = filters.dateFrom.getDate();

          // Compare dates by year, month, day
          if (docYear < filterYear ||
              (docYear === filterYear && docMonth < filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay < filterDay)) {
            return false;
          }
        }

        // Check date_to: document date should be <= dateTo
        if (filters.dateTo) {
          // Get the calendar date components from the filter (what the user selected)
          const filterYear = filters.dateTo.getFullYear();
          const filterMonth = filters.dateTo.getMonth();
          const filterDay = filters.dateTo.getDate();

          // Compare dates by year, month, day
          if (docYear > filterYear ||
              (docYear === filterYear && docMonth > filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay > filterDay)) {
            return false;
          }
        }
      }

      return true;
    });

    // Apply pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filtered.slice(startIndex, endIndex);
  },

  getActiveFilterCount: () => {
    const { filters } = get();
    let count = 0;
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'customMetadata') {
        count += Object.keys(value as Record<string, string[]>).length;
      } else if (key.includes('date')) {
        count += value ? 1 : 0;
      } else if (value instanceof Set) {
        count += value.size;
      }
    }
    return count;
  },

  getFilteredDocumentsCount: () => {
    const { searchResults, filters } = get();
    if (!searchResults) return 0;

    const filtered = searchResults.documents.filter(doc => {
      // Set filters
      if (filters.keywords.size > 0 &&
          !doc.keywords?.some(keyword => filters.keywords.has(keyword))) return false;

      if (filters.legalConcepts.size > 0 &&
          !doc.legal_concepts?.some(concept => filters.legalConcepts.has(concept.concept_name))) return false;

      if (filters.issuingBodies.size > 0 &&
          !filters.issuingBodies.has(doc.issuing_body?.name || '')) return false;

      if (filters.languages && filters.languages.size > 0 &&
          !filters.languages.has(doc.language || '')) return false;

      // Date filtering - compare only the date part (ignore time)
      if (filters.dateFrom || filters.dateTo) {
        // Fallback order for dates:
        // 1) date_issued (canonical)
        // 2) publication_date (judgments)
        // 3) issue_date / interpretation_date (tax interpretations & legacy ETL)
        const meta: Record<string, unknown> = doc.metadata || {};
        const docDateStr: string | null =
          doc.date_issued ||
          (typeof meta.publication_date === 'string' ? meta.publication_date : null) ||
          (typeof meta.issue_date === 'string' ? meta.issue_date : null) ||
          (typeof meta.interpretation_date === 'string' ? meta.interpretation_date : null) ||
          null;

        // If document has no date, EXCLUDE it when date filter is active
        if (!docDateStr || docDateStr.trim() === '') {
          return false;
        }

        // Try to parse the date
        let docDate: Date;
        try {
          // Try parsing as ISO string first
          docDate = parseISO(docDateStr);

          // If parseISO fails, try new Date
          if (!isValid(docDate)) {
            docDate = new Date(docDateStr);
          }
        } catch {
          // If parsing fails completely, EXCLUDE the document
          return false;
        }

        // If still invalid, EXCLUDE the document
        if (!isValid(docDate)) return false;

        // Extract date components (year, month, day) for comparison
        const docYear = docDate.getUTCFullYear();
        const docMonth = docDate.getUTCMonth();
        const docDay = docDate.getUTCDate();

        // Check date_from: document date should be >= dateFrom
        if (filters.dateFrom) {
          const filterYear = filters.dateFrom.getFullYear();
          const filterMonth = filters.dateFrom.getMonth();
          const filterDay = filters.dateFrom.getDate();

          if (docYear < filterYear ||
              (docYear === filterYear && docMonth < filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay < filterDay)) {
            return false;
          }
        }

        // Check date_to: document date should be <= dateTo
        if (filters.dateTo) {
          const filterYear = filters.dateTo.getFullYear();
          const filterMonth = filters.dateTo.getMonth();
          const filterDay = filters.dateTo.getDate();

          if (docYear > filterYear ||
              (docYear === filterYear && docMonth > filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay > filterDay)) {
            return false;
          }
        }
      }

      return true;
    });

    return filtered.length;
  },

  setSearchType: (type: "rabbit" | "thinking") => set({ searchType: type }),

  // Batch selection actions
  toggleDocumentSelection: (documentId: string) => {
    set((state) => {
      const newSet = new Set(state.selectedDocumentIds);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return { selectedDocumentIds: newSet };
    });
  },

  selectAllDocuments: () => {
    // Use filtered metadata for new optimized flow, fallback to old flow
    const filteredMetadata = get().getFilteredMetadata();
    if (filteredMetadata.length > 0) {
      const allIds = new Set(filteredMetadata.map(m => m.document_id));
      set({ selectedDocumentIds: allIds });
    } else {
      // Fallback to old flow
      const filteredDocs = get().getFilteredDocuments();
      const allIds = new Set(filteredDocs.map(doc => doc.document_id));
      set({ selectedDocumentIds: allIds });
    }
  },

  clearSelection: () => {
    set({ selectedDocumentIds: new Set<string>() });
  },


  getSelectedDocuments: () => {
    const { searchResults, searchMetadata, selectedDocumentIds } = get();

    // New optimized flow - use metadata
    if (searchMetadata && searchMetadata.length > 0) {
      // Filter selected metadata and convert to SearchDocument format
      const selectedMetadata = searchMetadata.filter(m =>
        selectedDocumentIds.has(m.document_id)
      );

      // Convert metadata to SearchDocument (minimal conversion for compatibility)
      return selectedMetadata.map(m => ({
        document_id: m.document_id,
        language: m.language,
        keywords: m.keywords || [],
        date_issued: m.date_issued?.toString() || null,
        score: m.score || null,
        // Use available metadata fields
        document_number: m.document_number || null,
        title: m.title || null,
        summary: m.summary || null,
        court_name: m.court_name || null,
        thesis: m.thesis || null,
        // Required fields with null defaults
        issuing_body: null,
        full_text: null,
        legal_references: null,
        legal_concepts: null,
        country: null,
        department_name: null,
        presiding_judge: null,
        judges: null,
        parties: null,
        outcome: null,
        legal_bases: null,
        extracted_legal_bases: null,
        references: null,
        factual_state: null,
        legal_state: null,
        metadata: {},
      } as SearchDocument));
    }

    // Fallback to old flow
    if (!searchResults) return [];
    return searchResults.documents.filter(doc =>
      selectedDocumentIds.has(doc.document_id)
    );
  },

  getSelectedDocumentCount: () => {
    return get().selectedDocumentIds.size;
  },

  // New optimized search actions implementations
  setSearchMetadata: (metadata: LegalDocumentMetadata[], total: number, capped: boolean) => {
    set({
      searchMetadata: metadata,
      totalResultsCount: total,
      isCapped: capped,
      currentPage: 1, // Reset to first page when new search metadata comes in
      selectedDocumentIds: new Set<string>(), // Clear selection on new search
      totalResults: total,
      totalPages: Math.ceil(total / get().pageSize)
    });
  },

  setChunksForDocuments: (documentId: string, chunks: SearchChunk[]) => {
    set((state) => {
      const newCache = { ...state.chunksCache, [documentId]: chunks };
      const newLoading = state.loadingChunks.filter(id => id !== documentId);
      return {
        chunksCache: newCache,
        loadingChunks: newLoading
      };
    });
  },

  clearChunksCache: () => {
    set({
      chunksCache: {},
      loadingChunks: []
    });
  },

  addLoadingChunk: (documentId: string) => {
    set((state) => {
      if (state.loadingChunks.includes(documentId)) {
        return state; // Already loading
      }
      return { loadingChunks: [...state.loadingChunks, documentId] };
    });
  },

  removeLoadingChunk: (documentId: string) => {
    set((state) => ({
      loadingChunks: state.loadingChunks.filter(id => id !== documentId)
    }));
  },

  // Progressive loading actions
  setPaginationMetadata: (metadata: PaginationMetadata | null) => {
    set((state) => ({
      paginationMetadata: metadata,
      // Cache the estimated total from the first request
      cachedEstimatedTotal: metadata?.estimated_total ?? state.cachedEstimatedTotal,
    }));
  },

  setIsLoadingMore: (loading: boolean) => {
    set({ isLoadingMore: loading });
  },

  appendSearchMetadata: (metadata: LegalDocumentMetadata[]) => {
    set((state) => ({
      searchMetadata: [...state.searchMetadata, ...metadata],
      totalResultsCount: state.totalResultsCount + metadata.length,
    }));
  },

  resetSearch: () => {
    set({
      searchMetadata: [],
      totalResultsCount: 0,
      isCapped: false,
      chunksCache: {},
      loadingChunks: [],
      paginationMetadata: null,
      isLoadingMore: false,
      cachedEstimatedTotal: null,
      selectedDocumentIds: new Set<string>(),
      currentPage: 1,
    });
  },

  // New metadata filtering functions
  getFilteredMetadata: () => {
    const { searchMetadata, filters } = get();
    if (!searchMetadata || searchMetadata.length === 0) return [];

    const filtered = searchMetadata.filter(metadata => {
      // Keywords filter
      if (filters.keywords.size > 0 &&
          !metadata.keywords?.some(keyword => filters.keywords.has(keyword))) {
        return false;
      }

      // Court name filter (using issuingBodies filter for court names)
      if (filters.issuingBodies.size > 0 &&
          !filters.issuingBodies.has(metadata.court_name || '')) {
        return false;
      }

      // Language filter
      if (filters.languages && filters.languages.size > 0 &&
          !filters.languages.has(metadata.language || '')) {
        return false;
      }

      // Jurisdiction filter
      if (filters.jurisdictions.size > 0 &&
          !filters.jurisdictions.has(metadata.jurisdiction || '')) {
        return false;
      }

      // Court level filter
      if (filters.courtLevels.size > 0 &&
          !filters.courtLevels.has(metadata.court_level || '')) {
        return false;
      }

      // Legal domain filter
      if (filters.legalDomains.size > 0 &&
          !filters.legalDomains.has(metadata.legal_domain || '')) {
        return false;
      }

      // Custom metadata filter
      for (const [key, values] of Object.entries(filters.customMetadata)) {
        if (values.length > 0) {
          const metaValue = metadata.custom_metadata?.[key];
          if (metaValue === null || metaValue === undefined) return false;
          if (Array.isArray(metaValue)) {
            if (!metaValue.some(v => values.includes(String(v)))) return false;
          } else {
            if (!values.includes(String(metaValue))) return false;
          }
        }
      }

      // Date filtering - compare only the date part (ignore time)
      if (filters.dateFrom || filters.dateTo) {
        // IMPORTANT: date_issued in metadata may come from either the real
        // date_issued field or (as a fallback) publication_date, depending
        // on how we constructed the metadata. If it's missing, we EXCLUDE
        // the document when a date filter is active.
        const docDateStr: string | null = metadata.date_issued;

        // If document has no date, EXCLUDE it when date filter is active
        if (!docDateStr || docDateStr.trim() === '') {
          return false;
        }

        // Try to parse the date
        let docDate: Date;
        try {
          // Try parsing as ISO string first
          docDate = parseISO(docDateStr);

          // If parseISO fails, try new Date
          if (!isValid(docDate)) {
            docDate = new Date(docDateStr);
          }
        } catch {
          // If parsing fails completely, EXCLUDE the document
          return false;
        }

        // If still invalid, EXCLUDE the document
        if (!isValid(docDate)) {
          return false;
        }

        // Extract date components (year, month, day) for comparison
        const docYear = docDate.getUTCFullYear();
        const docMonth = docDate.getUTCMonth();
        const docDay = docDate.getUTCDate();

        // Check date_from: document date should be >= dateFrom
        if (filters.dateFrom) {
          const filterYear = filters.dateFrom.getFullYear();
          const filterMonth = filters.dateFrom.getMonth();
          const filterDay = filters.dateFrom.getDate();

          if (docYear < filterYear ||
              (docYear === filterYear && docMonth < filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay < filterDay)) {
            return false;
          }
        }

        // Check date_to: document date should be <= dateTo
        if (filters.dateTo) {
          const filterYear = filters.dateTo.getFullYear();
          const filterMonth = filters.dateTo.getMonth();
          const filterDay = filters.dateTo.getDate();

          if (docYear > filterYear ||
              (docYear === filterYear && docMonth > filterMonth) ||
              (docYear === filterYear && docMonth === filterMonth && docDay > filterDay)) {
            return false;
          }
        }
      }

      return true;
    });

    // Sort by score (descending - highest score first)
    // Documents with null/undefined scores go to the end
    const sorted = filtered.sort((a, b) => {
      const scoreA = a.score ?? -Infinity;
      const scoreB = b.score ?? -Infinity;
      return scoreB - scoreA; // Descending order
    });

    return sorted;
  },

  getFilteredMetadataCount: () => {
    const filtered = get().getFilteredMetadata();
    return filtered.length;
  },

  getAvailableFiltersFromMetadata: () => {
    // Use filtered metadata to exclude unknown types
    const filteredMetadata = get().getFilteredMetadata();
    if (!filteredMetadata || filteredMetadata.length === 0) {
      return {
        keywords: [],
        legalConcepts: [],
        issuingBodies: [],
        languages: [],
        jurisdictions: [],
        courtLevels: [],
        legalDomains: [],
        customMetadataKeys: [],
      };
    }

    // Extract unique values from filtered metadata
    const keywordsSet = new Set<string>();
    const issuingBodiesSet = new Set<string>();
    const languagesSet = new Set<string>();
    const jurisdictionsSet = new Set<string>();
    const courtLevelsSet = new Set<string>();
    const legalDomainsSet = new Set<string>();
    const customMetadataKeysSet = new Set<string>();

    filteredMetadata.forEach(metadata => {
      // Keywords
      if (metadata.keywords) {
        metadata.keywords.forEach(keyword => keywordsSet.add(keyword));
      }

      // Language
      if (metadata.language) {
        languagesSet.add(metadata.language);
      }

      // Court names (using as issuing bodies)
      if (metadata.court_name) {
        issuingBodiesSet.add(metadata.court_name);
      }

      // Jurisdiction
      if (metadata.jurisdiction) {
        jurisdictionsSet.add(metadata.jurisdiction);
      }

      // Court level
      if (metadata.court_level) {
        courtLevelsSet.add(metadata.court_level);
      }

      // Legal domain
      if (metadata.legal_domain) {
        legalDomainsSet.add(metadata.legal_domain);
      }

      // Custom metadata keys
      if (metadata.custom_metadata) {
        Object.keys(metadata.custom_metadata).forEach(key => customMetadataKeysSet.add(key));
      }
    });

    return {
      keywords: Array.from(keywordsSet),
      legalConcepts: [],
      issuingBodies: Array.from(issuingBodiesSet),
      languages: Array.from(languagesSet),
      jurisdictions: Array.from(jurisdictionsSet),
      courtLevels: Array.from(courtLevelsSet),
      legalDomains: Array.from(legalDomainsSet),
      customMetadataKeys: Array.from(customMetadataKeysSet),
    };
  },

  // New properties
  isFiltersDialogOpen: false,
  isDocumentDialogOpen: false,
  selectedDocument: null,
  handleDateChange: () => {
    // Implementation of handleDateChange
  },
  setFilters: (filters: SearchFilters) => set({ filters }),
  setAvailableFilters: (availableFilters: AvailableFilters | null) => set({ availableFilters }),
  toggleFiltersDialog: () => set({ isFiltersDialogOpen: !get().isFiltersDialogOpen }),
  toggleDocumentDialog: () => set({ isDocumentDialogOpen: !get().isDocumentDialogOpen }),
  setSelectedDocument: (document: SearchDocument | null) => set({ selectedDocument: document }),

  // Feedback vote actions
  setFeedbackVote: (documentId: string, rating: 'relevant' | 'not_relevant' | null) => {
    set((state) => {
      const updated = { ...state.feedbackVotes };
      if (rating === null) {
        delete updated[documentId];
      } else {
        updated[documentId] = rating;
      }
      return { feedbackVotes: updated };
    });
  },
}));

// Set up store subscription for auto-saving with debounce
// CRITICAL: Without debounce, localStorage.setItem is called synchronously on EVERY state change
// which blocks the main thread and causes UI freezing during search operations
if (typeof window !== 'undefined') {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  useSearchStore.subscribe((state) => {
    // Clear any pending save
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Debounce: Wait 2 seconds after last state change before saving
    // This prevents hundreds of synchronous localStorage writes during search
    saveTimeout = setTimeout(() => {
      (state as SearchState).saveState();
      saveTimeout = null;
    }, 2000);
  });
}

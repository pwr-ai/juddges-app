/**
 * Tests for the searchStore Zustand store.
 *
 * Exercises: initial state, setters, filter toggling, document selection,
 * and computed getters. The legacy multi-document-type plumbing
 * (`documentTypes`, `setDocumentTypes`, `isUnknownDocumentType`) was
 * removed when search collapsed to judgment-only — see
 * `docs/superpowers/specs/2026-05-09-search-judgment-only-blazing-fast.md`.
 */

import { useSearchStore } from '@/lib/store/searchStore';
import type { SearchDocument, SearchChunk } from '@/types/search';

// Factory helpers
function makeDoc(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    document_id: 'd-1',
    document_type: 'judgment',
    title: 'Test Doc',
    date_issued: '2025-01-01',
    language: 'en',
    ...overrides,
  } as SearchDocument;
}

describe('searchStore', () => {
  beforeEach(() => {
    // Reset all store state before each test
    useSearchStore.setState({
      query: '',
      selectedLanguages: new Set(['uk', 'pl']),
      searchType: 'thinking',
      currentPage: 1,
      pageSize: 20,
      totalResults: 0,
      totalPages: 0,
      searchResults: null,
      isSearching: false,
      error: null,
      searchMetadata: [],
      totalResultsCount: 0,
      isCapped: false,
      chunksCache: {},
      loadingChunks: [],
      paginationMetadata: null,
      isLoadingMore: false,
      cachedEstimatedTotal: null,
      filters: {
        keywords: new Set(),
        legalConcepts: new Set(),
        issuingBodies: new Set(),
        languages: new Set(),
        dateFrom: undefined,
        dateTo: undefined,
        jurisdictions: new Set(),
        courtLevels: new Set(),
        legalDomains: new Set(),
        customMetadata: {},
      },
      availableFilters: null,
      filterVersion: 0,
      selectedDoc: null,
      selectedChunks: [],
      isDialogOpen: false,
      showSaveAllPopover: false,
      selectedDocumentIds: new Set(),
    });
  });

  // ── Initial state ──────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has empty query and default languages', () => {
      const state = useSearchStore.getState();
      expect(state.query).toBe('');
      expect(state.selectedLanguages).toEqual(new Set(['uk', 'pl']));
      expect(state.searchType).toBe('thinking');
    });

    it('has no search results initially', () => {
      expect(useSearchStore.getState().searchResults).toBeNull();
      expect(useSearchStore.getState().isSearching).toBe(false);
    });
  });

  // ── Simple setters ────────────────────────────────────────────────────

  describe('setters', () => {
    it('setQuery updates query', () => {
      useSearchStore.getState().setQuery('tax law');
      expect(useSearchStore.getState().query).toBe('tax law');
    });

    it('setIsSearching updates searching state', () => {
      useSearchStore.getState().setIsSearching(true);
      expect(useSearchStore.getState().isSearching).toBe(true);
    });

    it('setError sets and clears error', () => {
      useSearchStore.getState().setError('Something failed');
      expect(useSearchStore.getState().error).toBe('Something failed');

      useSearchStore.getState().setError(null);
      expect(useSearchStore.getState().error).toBeNull();
    });

    it('setCurrentPage updates page', () => {
      useSearchStore.getState().setCurrentPage(3);
      expect(useSearchStore.getState().currentPage).toBe(3);
    });

    it('setSearchType toggles between rabbit and thinking', () => {
      useSearchStore.getState().setSearchType('rabbit');
      expect(useSearchStore.getState().searchType).toBe('rabbit');
    });
  });

  // ── Filter toggling ───────────────────────────────────────────────────

  describe('toggleFilter', () => {
    it('adds a keyword filter', () => {
      useSearchStore.getState().toggleFilter('keywords', 'tax');
      expect(useSearchStore.getState().filters.keywords.has('tax')).toBe(true);
    });

    it('removes a keyword filter on second toggle', () => {
      useSearchStore.getState().toggleFilter('keywords', 'tax');
      useSearchStore.getState().toggleFilter('keywords', 'tax');
      expect(useSearchStore.getState().filters.keywords.has('tax')).toBe(false);
    });

    it('increments filterVersion on toggle', () => {
      const v0 = useSearchStore.getState().filterVersion;
      useSearchStore.getState().toggleFilter('languages', 'pl');
      expect(useSearchStore.getState().filterVersion).toBe(v0 + 1);
    });
  });

  // ── Date filters ──────────────────────────────────────────────────────

  describe('setDateFilter', () => {
    it('sets dateFrom', () => {
      const date = new Date('2025-01-01');
      useSearchStore.getState().setDateFilter('dateFrom', date);
      expect(useSearchStore.getState().filters.dateFrom).toEqual(date);
    });

    it('sets dateTo', () => {
      const date = new Date('2025-12-31');
      useSearchStore.getState().setDateFilter('dateTo', date);
      expect(useSearchStore.getState().filters.dateTo).toEqual(date);
    });

    it('clears date filter with undefined', () => {
      useSearchStore.getState().setDateFilter('dateFrom', new Date());
      useSearchStore.getState().setDateFilter('dateFrom', undefined);
      expect(useSearchStore.getState().filters.dateFrom).toBeUndefined();
    });
  });

  // ── resetFilters ──────────────────────────────────────────────────────

  describe('resetFilters', () => {
    it('clears all filters', () => {
      useSearchStore.getState().toggleFilter('keywords', 'tax');
      useSearchStore.getState().toggleFilter('languages', 'pl');
      useSearchStore.getState().setDateFilter('dateFrom', new Date());

      useSearchStore.getState().resetFilters();

      const filters = useSearchStore.getState().filters;
      expect(filters.keywords.size).toBe(0);
      expect(filters.languages.size).toBe(0);
      expect(filters.dateFrom).toBeUndefined();
    });
  });

  // ── Document selection ────────────────────────────────────────────────

  describe('document selection', () => {
    it('toggleDocumentSelection adds and removes', () => {
      useSearchStore.getState().toggleDocumentSelection('d-1');
      expect(useSearchStore.getState().selectedDocumentIds.has('d-1')).toBe(true);

      useSearchStore.getState().toggleDocumentSelection('d-1');
      expect(useSearchStore.getState().selectedDocumentIds.has('d-1')).toBe(false);
    });

    it('clearSelection empties selected IDs', () => {
      useSearchStore.getState().toggleDocumentSelection('d-1');
      useSearchStore.getState().toggleDocumentSelection('d-2');
      useSearchStore.getState().clearSelection();
      expect(useSearchStore.getState().selectedDocumentIds.size).toBe(0);
    });

    it('getSelectedDocumentCount returns correct count', () => {
      useSearchStore.getState().toggleDocumentSelection('d-1');
      useSearchStore.getState().toggleDocumentSelection('d-2');
      expect(useSearchStore.getState().getSelectedDocumentCount()).toBe(2);
    });
  });

  // ── Dialog management ─────────────────────────────────────────────────

  describe('dialog management', () => {
    it('openDocumentDialog sets doc and opens dialog', () => {
      const doc = makeDoc();
      useSearchStore.getState().openDocumentDialog(doc, []);

      expect(useSearchStore.getState().selectedDoc).toEqual(doc);
      expect(useSearchStore.getState().isDialogOpen).toBe(true);
    });

    it('closeDocumentDialog resets dialog state', () => {
      useSearchStore.getState().openDocumentDialog(makeDoc(), []);
      useSearchStore.getState().closeDocumentDialog();

      expect(useSearchStore.getState().isDialogOpen).toBe(false);
    });
  });

  // ── Chunks cache management ───────────────────────────────────────────

  describe('chunks cache', () => {
    it('setChunksForDocuments stores chunks', () => {
      const chunks: SearchChunk[] = [{ document_id: 'd1', chunk_id: 'c1', chunk_text: 'text' }];
      useSearchStore.getState().setChunksForDocuments('d1', chunks);
      expect(useSearchStore.getState().chunksCache['d1']).toEqual(chunks);
    });

    it('clearChunksCache empties the cache', () => {
      useSearchStore.getState().setChunksForDocuments('d1', []);
      useSearchStore.getState().clearChunksCache();
      expect(Object.keys(useSearchStore.getState().chunksCache)).toHaveLength(0);
    });

    it('addLoadingChunk and removeLoadingChunk manage loading state', () => {
      useSearchStore.getState().addLoadingChunk('d1');
      expect(useSearchStore.getState().loadingChunks).toContain('d1');

      useSearchStore.getState().removeLoadingChunk('d1');
      expect(useSearchStore.getState().loadingChunks).not.toContain('d1');
    });
  });

  // ── Progressive loading ───────────────────────────────────────────────

  describe('progressive loading', () => {
    it('setIsLoadingMore updates loading state', () => {
      useSearchStore.getState().setIsLoadingMore(true);
      expect(useSearchStore.getState().isLoadingMore).toBe(true);
    });

    it('setPaginationMetadata sets metadata', () => {
      const meta = { offset: 0, limit: 20, loaded_count: 20, estimated_total: 100, has_more: true, next_offset: 20 };
      useSearchStore.getState().setPaginationMetadata(meta);
      expect(useSearchStore.getState().paginationMetadata).toEqual(meta);
    });
  });
});

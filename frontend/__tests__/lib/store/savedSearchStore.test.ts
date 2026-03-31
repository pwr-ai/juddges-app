/**
 * Tests for the savedSearchStore Zustand store.
 *
 * Exercises: fetchSearches, createSearch, updateSearch, deleteSearch, recordUsage.
 */

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

import { useSavedSearchStore } from '@/lib/store/savedSearchStore';
import { act } from '@testing-library/react';
import type { SavedSearch } from '@/types/saved-search';

// Helper factory
function makeSavedSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 'ss-1',
    user_id: 'u-1',
    name: 'Test Search',
    description: null,
    folder: null,
    query: 'contract law',
    search_config: {},
    document_types: ['judgment'],
    languages: ['en'],
    search_mode: 'thinking',
    is_shared: false,
    shared_with: [],
    last_used_at: null,
    use_count: 0,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  } as SavedSearch;
}

function okResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({ error: 'fail' }) } as Response;
}

describe('savedSearchStore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Reset the store state between tests
    useSavedSearchStore.setState({
      searches: [],
      isLoading: false,
      error: null,
      folders: [],
    });
  });

  // ── fetchSearches ──────────────────────────────────────────────────────

  describe('fetchSearches', () => {
    it('fetches and stores searches, extracting unique folders', async () => {
      const searches = [
        makeSavedSearch({ id: '1', folder: 'Legal' }),
        makeSavedSearch({ id: '2', folder: 'Tax' }),
        makeSavedSearch({ id: '3', folder: 'Legal' }),
      ];
      mockFetch.mockResolvedValueOnce(okResponse(searches));

      await act(async () => {
        await useSavedSearchStore.getState().fetchSearches();
      });

      const state = useSavedSearchStore.getState();
      expect(state.searches).toHaveLength(3);
      expect(state.folders).toEqual(['Legal', 'Tax']);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('passes folder query param when provided', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([]));
      await act(async () => {
        await useSavedSearchStore.getState().fetchSearches('Legal');
      });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('folder=Legal'));
    });

    it('sets error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));
      await act(async () => {
        await useSavedSearchStore.getState().fetchSearches();
      });

      const state = useSavedSearchStore.getState();
      expect(state.error).toBe('Failed to load saved searches');
      expect(state.isLoading).toBe(false);
    });
  });

  // ── createSearch ───────────────────────────────────────────────────────

  describe('createSearch', () => {
    it('creates a search and prepends it to the list', async () => {
      const created = makeSavedSearch({ id: 'new-1', name: 'New Search' });
      mockFetch.mockResolvedValueOnce(okResponse(created));

      let result: SavedSearch | null = null;
      await act(async () => {
        result = await useSavedSearchStore.getState().createSearch({
          name: 'New Search',
          query: 'test',
        } as any);
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe('new-1');
      expect(useSavedSearchStore.getState().searches[0].id).toBe('new-1');
    });

    it('adds new folder when saved search has one', async () => {
      const created = makeSavedSearch({ id: 'new-1', folder: 'NewFolder' });
      mockFetch.mockResolvedValueOnce(okResponse(created));

      await act(async () => {
        await useSavedSearchStore.getState().createSearch({ name: 'x', query: 'y' } as any);
      });

      expect(useSavedSearchStore.getState().folders).toContain('NewFolder');
    });

    it('returns null on failure and sets error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      let result: SavedSearch | null = null;
      await act(async () => {
        result = await useSavedSearchStore.getState().createSearch({ name: 'x', query: 'y' } as any);
      });

      expect(result).toBeNull();
      expect(useSavedSearchStore.getState().error).toBe('Failed to save search');
    });
  });

  // ── updateSearch ───────────────────────────────────────────────────────

  describe('updateSearch', () => {
    it('updates a search in the list', async () => {
      useSavedSearchStore.setState({ searches: [makeSavedSearch({ id: 's1', name: 'Old' })] });

      const updated = makeSavedSearch({ id: 's1', name: 'Updated' });
      mockFetch.mockResolvedValueOnce(okResponse(updated));

      await act(async () => {
        await useSavedSearchStore.getState().updateSearch('s1', { name: 'Updated' } as any);
      });

      expect(useSavedSearchStore.getState().searches[0].name).toBe('Updated');
    });

    it('returns null on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      let result: SavedSearch | null = null;
      await act(async () => {
        result = await useSavedSearchStore.getState().updateSearch('s1', {} as any);
      });

      expect(result).toBeNull();
    });
  });

  // ── deleteSearch ───────────────────────────────────────────────────────

  describe('deleteSearch', () => {
    it('removes search from list and updates folders', async () => {
      useSavedSearchStore.setState({
        searches: [
          makeSavedSearch({ id: 's1', folder: 'A' }),
          makeSavedSearch({ id: 's2', folder: 'B' }),
        ],
        folders: ['A', 'B'],
      });

      mockFetch.mockResolvedValueOnce(okResponse({}));

      let result = false;
      await act(async () => {
        result = await useSavedSearchStore.getState().deleteSearch('s1');
      });

      expect(result).toBe(true);
      expect(useSavedSearchStore.getState().searches).toHaveLength(1);
      // Folder 'A' should be removed since no searches reference it
      expect(useSavedSearchStore.getState().folders).toEqual(['B']);
    });

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      let result = true;
      await act(async () => {
        result = await useSavedSearchStore.getState().deleteSearch('s1');
      });

      expect(result).toBe(false);
    });
  });

  // ── recordUsage ────────────────────────────────────────────────────────

  describe('recordUsage', () => {
    it('optimistically increments use_count and updates last_used_at', async () => {
      useSavedSearchStore.setState({
        searches: [makeSavedSearch({ id: 's1', use_count: 5 })],
      });

      mockFetch.mockResolvedValueOnce(okResponse({}));

      await act(async () => {
        await useSavedSearchStore.getState().recordUsage('s1');
      });

      const updated = useSavedSearchStore.getState().searches[0];
      expect(updated.use_count).toBe(6);
      expect(updated.last_used_at).not.toBeNull();
    });
  });
});

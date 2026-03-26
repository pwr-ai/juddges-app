import { create } from 'zustand';
import type { SavedSearch, CreateSavedSearchInput, UpdateSavedSearchInput } from '@/types/saved-search';
import logger from '@/lib/logger';

const storeLogger = logger.child('savedSearchStore');

interface SavedSearchState {
  searches: SavedSearch[];
  isLoading: boolean;
  error: string | null;
  folders: string[];

  // Actions
  fetchSearches: (folder?: string) => Promise<void>;
  createSearch: (input: CreateSavedSearchInput) => Promise<SavedSearch | null>;
  updateSearch: (id: string, input: UpdateSavedSearchInput) => Promise<SavedSearch | null>;
  deleteSearch: (id: string) => Promise<boolean>;
  recordUsage: (id: string) => Promise<void>;
}

export const useSavedSearchStore = create<SavedSearchState>()((set, get) => ({
  searches: [],
  isLoading: false,
  error: null,
  folders: [],

  fetchSearches: async (folder?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      const url = `/api/saved-searches${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch saved searches');
      }

      const searches: SavedSearch[] = await response.json();

      // Extract unique folders
      const folderSet = new Set<string>();
      searches.forEach(s => {
        if (s.folder) folderSet.add(s.folder);
      });

      set({
        searches,
        folders: Array.from(folderSet).sort(),
        isLoading: false,
      });
    } catch (error) {
      storeLogger.error('Failed to fetch saved searches', error);
      set({ error: 'Failed to load saved searches', isLoading: false });
    }
  },

  createSearch: async (input: CreateSavedSearchInput) => {
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error('Failed to create saved search');
      }

      const savedSearch: SavedSearch = await response.json();

      set((state) => {
        const folders = savedSearch.folder && !state.folders.includes(savedSearch.folder)
          ? [...state.folders, savedSearch.folder].sort()
          : state.folders;
        return {
          searches: [savedSearch, ...state.searches],
          folders,
        };
      });

      return savedSearch;
    } catch (error) {
      storeLogger.error('Failed to create saved search', error);
      set({ error: 'Failed to save search' });
      return null;
    }
  },

  updateSearch: async (id: string, input: UpdateSavedSearchInput) => {
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...input }),
      });

      if (!response.ok) {
        throw new Error('Failed to update saved search');
      }

      const updatedSearch: SavedSearch = await response.json();

      set((state) => ({
        searches: state.searches.map(s => s.id === id ? updatedSearch : s),
      }));

      return updatedSearch;
    } catch (error) {
      storeLogger.error('Failed to update saved search', error);
      set({ error: 'Failed to update saved search' });
      return null;
    }
  },

  deleteSearch: async (id: string) => {
    try {
      const response = await fetch(`/api/saved-searches?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete saved search');
      }

      set((state) => {
        const remaining = state.searches.filter(s => s.id !== id);
        const folderSet = new Set<string>();
        remaining.forEach(s => {
          if (s.folder) folderSet.add(s.folder);
        });
        return {
          searches: remaining,
          folders: Array.from(folderSet).sort(),
        };
      });

      return true;
    } catch (error) {
      storeLogger.error('Failed to delete saved search', error);
      set({ error: 'Failed to delete saved search' });
      return false;
    }
  },

  recordUsage: async (id: string) => {
    // Optimistic update
    set((state) => ({
      searches: state.searches.map(s =>
        s.id === id
          ? { ...s, use_count: s.use_count + 1, last_used_at: new Date().toISOString() }
          : s
      ),
    }));

    // Update on server (fire and forget)
    try {
      await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          last_used_at: new Date().toISOString(),
        }),
      });
    } catch {
      // Non-critical, don't show error
    }
  },
}));

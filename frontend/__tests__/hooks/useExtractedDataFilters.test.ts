/**
 * Tests for useExtractedDataFilters, useFilterOptions, useFacetCounts, useFilteredDocuments hooks
 *
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import {
  useExtractedDataFilters,
  useFilterOptions,
  useFacetCounts,
  useFilteredDocuments,
} from '@/lib/hooks/useExtractedDataFilters';

// --- Mocks ---

const mockReplace = jest.fn();
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/test',
}));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  // Reset search params between tests
  Array.from(mockSearchParams.keys()).forEach((key) => mockSearchParams.delete(key));
});

// ──────────────────────────────────────────────────────────
// useExtractedDataFilters
// ──────────────────────────────────────────────────────────

describe('useExtractedDataFilters', () => {
  describe('initial state', () => {
    it('returns empty filters and zero active filter count by default', () => {
      const { result } = renderHook(() => useExtractedDataFilters());

      expect(result.current.filters).toEqual({});
      expect(result.current.activeFilterCount).toBe(0);
      expect(result.current.isFiltering).toBe(false);
    });

    it('accepts initial filters via options', () => {
      const initial = { court: 'Supreme Court', status: 'active' };
      const { result } = renderHook(() =>
        useExtractedDataFilters({ initialFilters: initial })
      );

      expect(result.current.filters).toEqual(initial);
      expect(result.current.activeFilterCount).toBe(2);
      expect(result.current.isFiltering).toBe(true);
    });
  });

  describe('setFilters', () => {
    it('replaces the entire filter state', () => {
      const { result } = renderHook(() => useExtractedDataFilters());

      act(() => {
        result.current.setFilters({ jurisdiction: 'PL', year: '2024' });
      });

      expect(result.current.filters).toEqual({ jurisdiction: 'PL', year: '2024' });
      expect(result.current.activeFilterCount).toBe(2);
    });
  });

  describe('updateFilter', () => {
    it('adds a new filter field', () => {
      const { result } = renderHook(() => useExtractedDataFilters());

      act(() => {
        result.current.updateFilter('court', 'District Court');
      });

      expect(result.current.filters.court).toBe('District Court');
      expect(result.current.activeFilterCount).toBe(1);
    });

    it('overwrites an existing filter field', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ initialFilters: { court: 'old' } })
      );

      act(() => {
        result.current.updateFilter('court', 'new');
      });

      expect(result.current.filters.court).toBe('new');
    });

    it('removes a filter field when value is undefined', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ initialFilters: { court: 'test', type: 'civil' } })
      );

      act(() => {
        result.current.updateFilter('court', undefined);
      });

      expect(result.current.filters.court).toBeUndefined();
      // Only 'type' should remain
      expect(result.current.activeFilterCount).toBe(1);
    });
  });

  describe('removeFilter', () => {
    it('removes a specific filter by field name', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ initialFilters: { a: '1', b: '2' } })
      );

      act(() => {
        result.current.removeFilter('a');
      });

      expect(result.current.filters.a).toBeUndefined();
      expect(result.current.filters.b).toBe('2');
    });
  });

  describe('clearFilters', () => {
    it('removes all filters', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ initialFilters: { x: '1', y: '2', z: '3' } })
      );

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters).toEqual({});
      expect(result.current.activeFilterCount).toBe(0);
      expect(result.current.isFiltering).toBe(false);
    });
  });

  describe('URL sync', () => {
    it('does not call router.replace when syncToUrl is false', () => {
      const { result } = renderHook(() => useExtractedDataFilters());

      act(() => {
        result.current.updateFilter('court', 'test');
      });

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('calls router.replace with filter_ prefixed params when syncToUrl is true', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ syncToUrl: true })
      );

      act(() => {
        result.current.setFilters({ court: 'Supreme', active: 'true' });
      });

      expect(mockReplace).toHaveBeenCalled();
      const calledUrl = mockReplace.mock.calls[0][0] as string;
      expect(calledUrl).toContain('filter_court=Supreme');
      expect(calledUrl).toContain('filter_active=true');
    });

    it('serializes array values as comma-separated', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ syncToUrl: true })
      );

      act(() => {
        result.current.setFilters({ tags: ['civil', 'criminal'] });
      });

      const calledUrl = mockReplace.mock.calls[0][0] as string;
      expect(calledUrl).toContain('filter_tags=civil%2Ccriminal');
    });

    it('removes filter params from URL when clearing filters', () => {
      const { result } = renderHook(() =>
        useExtractedDataFilters({ syncToUrl: true })
      );

      act(() => {
        result.current.setFilters({ court: 'test' });
      });

      act(() => {
        result.current.clearFilters();
      });

      // Last call should have a URL without filter_ params
      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0] as string;
      expect(lastCall).not.toContain('filter_');
    });
  });

  describe('activeFilterCount and isFiltering', () => {
    it('counts only defined values', () => {
      const { result } = renderHook(() => useExtractedDataFilters());

      act(() => {
        result.current.setFilters({ a: '1', b: undefined as any, c: '3' });
      });

      // b is undefined, so only a and c count
      expect(result.current.activeFilterCount).toBe(2);
      expect(result.current.isFiltering).toBe(true);
    });
  });
});

// ──────────────────────────────────────────────────────────
// useFilterOptions
// ──────────────────────────────────────────────────────────

describe('useFilterOptions', () => {
  it('fetches filter configs on mount and returns them', async () => {
    const mockFields = [
      { field: 'court', type: 'string', filter_type: 'select', label: 'Court', order: 1 },
      { field: 'year', type: 'number', filter_type: 'range', label: 'Year', order: 2 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ fields: mockFields }),
    });

    const { result } = renderHook(() => useFilterOptions());

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filterConfigs).toEqual(mockFields);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/extractions/base-schema/filter-options');
  });

  it('sets error on failed fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useFilterOptions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch filter options');
    expect(result.current.filterConfigs).toEqual([]);
  });

  it('handles network error gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFilterOptions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('refetch triggers a new request', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fields: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fields: [{ field: 'new', type: 'string', filter_type: 'text', label: 'New', order: 1 }] }),
      });

    const { result } = renderHook(() => useFilterOptions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filterConfigs).toEqual([]);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.filterConfigs).toHaveLength(1);
  });

  it('defaults to empty array when response has no fields property', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useFilterOptions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filterConfigs).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────
// useFacetCounts
// ──────────────────────────────────────────────────────────

describe('useFacetCounts', () => {
  it('fetches facet counts for all specified fields in parallel', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('court')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ counts: [{ value: 'Supreme', count: 10 }] }),
        });
      }
      if (url.includes('type')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ counts: [{ value: 'civil', count: 5 }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ counts: [] }) });
    });

    const { result } = renderHook(() =>
      useFacetCounts({ fields: ['court', 'type'] })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.facetCounts.court).toEqual([{ value: 'Supreme', count: 10 }]);
    expect(result.current.facetCounts.type).toEqual([{ value: 'civil', count: 5 }]);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(() =>
      useFacetCounts({ fields: ['court'], enabled: false })
    );

    // Should remain in initial state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.facetCounts).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when fields is empty', async () => {
    const { result } = renderHook(() =>
      useFacetCounts({ fields: [] })
    );

    expect(result.current.isLoading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles partial failures gracefully', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('good')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ counts: [{ value: 'yes', count: 1 }] }),
        });
      }
      // bad field returns non-ok
      return Promise.resolve({ ok: false });
    });

    const { result } = renderHook(() =>
      useFacetCounts({ fields: ['good', 'bad'] })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.facetCounts.good).toEqual([{ value: 'yes', count: 1 }]);
    expect(result.current.facetCounts.bad).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────
// useFilteredDocuments
// ──────────────────────────────────────────────────────────

describe('useFilteredDocuments', () => {
  const mockDocuments = [
    {
      document_id: 'doc-1',
      supabase_document_id: 1,
      title: 'Test Judgment',
      date_issued: '2024-01-01',
      extracted_data: { court: 'Supreme' },
      jurisdiction: 'PL',
    },
  ];

  it('sends POST request with filters and returns documents', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        documents: mockDocuments,
        total_count: 1,
        has_more: false,
      }),
    });

    const { result } = renderHook(() =>
      useFilteredDocuments({ filters: { court: 'Supreme' } })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.documents).toEqual(mockDocuments);
    expect(result.current.totalCount).toBe(1);
    expect(result.current.hasMore).toBe(false);

    // Verify request body
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('/api/extractions/base-schema/filter');
    const body = JSON.parse(fetchCall[1].body);
    expect(body.filters).toEqual({ court: 'Supreme' });
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it('does not fetch when enabled is false', () => {
    renderHook(() =>
      useFilteredDocuments({ filters: {}, enabled: false })
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes textQuery, limit, and offset to the request', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ documents: [], total_count: 0, has_more: false }),
    });

    renderHook(() =>
      useFilteredDocuments({
        filters: { type: 'judgment' },
        textQuery: 'contract law',
        limit: 10,
        offset: 20,
      })
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.text_query).toBe('contract law');
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
  });

  it('sets error on failed fetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() =>
      useFilteredDocuments({ filters: {} })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('Failed to filter documents');
    expect(result.current.documents).toEqual([]);
  });

  it('handles network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Offline'));

    const { result } = renderHook(() =>
      useFilteredDocuments({ filters: {} })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('Offline');
  });

  it('defaults to empty values when response lacks properties', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useFilteredDocuments({ filters: {} })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.documents).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasMore).toBe(false);
  });
});

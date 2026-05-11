/**
 * Hook tests for useSearchAutocomplete
 *
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useSearchAutocomplete } from '@/hooks/useSearchAutocomplete';

describe('useSearchAutocomplete Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces requests and maps backend facet hits into topic suggestions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            value: 'Kredyty frankowe',
            count: 142,
            sources: ['legal_topics', 'keywords'],
          },
          {
            value: 'Kredyt mieszkaniowy',
            count: 37,
            sources: ['keywords'],
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('kred', { enabled: true, debounceMs: 200, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(global.fetch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/search/autocomplete?q=kred&limit=5',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(2);
      const [first, second] = result.current.suggestions;
      expect(first).toEqual({
        value: 'Kredyty frankowe',
        count: 142,
        sources: ['legal_topics', 'keywords'],
      });
      expect(second.value).toBe('Kredyt mieszkaniowy');
      expect(second.sources).toEqual(['keywords']);
    });
  });

  it('drops hits with empty values and filters unknown source labels', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          { value: '   ', count: 5, sources: ['legal_topics'] },
          {
            value: 'art. 720 k.c.',
            count: 12,
            sources: ['cited_legislation', 'mystery_source'],
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('art', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([
        {
          value: 'art. 720 k.c.',
          count: 12,
          sources: ['cited_legislation'],
        },
      ]);
    });
  });

  it('does not fetch when query is shorter than minimum characters', () => {
    const { result } = renderHook(() =>
      useSearchAutocomplete('v', { enabled: true, minChars: 2, debounceMs: 200 })
    );

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('defaults count to 0 when backend omits it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [{ value: 'Prawo pracy', sources: ['legal_topics'] }],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('prawo', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.suggestions[0]).toEqual({
        value: 'Prawo pracy',
        count: 0,
        sources: ['legal_topics'],
      });
    });
  });
});

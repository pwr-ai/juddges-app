/**
 * Hook tests for useSearchSuggestions (corpus-derived suggestions, issue #153)
 *
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import {
  useSearchSuggestions,
  type SuggestionHit,
} from '@/hooks/useSearchSuggestions';

describe('useSearchSuggestions Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces requests and surfaces suggestion hits from the API', async () => {
    const fixture: SuggestionHit = {
      id: 'legal_topic:pl:przestepstwa_narkotykowe',
      term: 'przestępstwa narkotykowe',
      language: 'pl',
      category: 'legal_topic',
      weight: 412,
      _formatted: { term: '<mark>przest</mark>ępstwa narkotykowe' },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestion_hits: [fixture] }),
    });

    const { result } = renderHook(() =>
      useSearchSuggestions('przest', { debounceMs: 250 })
    );

    // Loading flips on synchronously during the debounce window.
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(result.current.suggestionHits).toHaveLength(1);
    });
    expect(result.current.suggestionHits[0].term).toBe('przestępstwa narkotykowe');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/search/suggest');
    expect(calledUrl).toContain('q=przest');
  });

  it('forwards the language filter when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestion_hits: [] }),
    });

    renderHook(() => useSearchSuggestions('fraud', { language: 'en' }));

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('language=en');
  });

  it('does not fetch for queries shorter than minChars', async () => {
    renderHook(() => useSearchSuggestions('a', { minChars: 2 }));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns an empty list when the request fails (graceful fallback)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'boom' }),
    });

    const { result } = renderHook(() => useSearchSuggestions('fraud'));

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.suggestionHits).toEqual([]);
  });

  it('is disabled when enabled=false', async () => {
    renderHook(() => useSearchSuggestions('fraud', { enabled: false }));

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

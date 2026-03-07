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

  it('debounces requests and maps backend hits into suggestions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 'doc-1',
            title: 'VAT refund for digital services',
            summary: 'Tax interpretation summary',
            case_number: 'II CSK 123/25',
            jurisdiction: 'PL',
            court_name: 'Supreme Court',
            decision_date: '2025-06-01',
            _formatted: {
              title: '<mark>VAT</mark> refund for digital services',
              summary: 'Tax interpretation summary',
              case_number: 'II CSK 123/25',
              court_name: 'Supreme Court',
            },
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('vat', { enabled: true, debounceMs: 200, limit: 5 })
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
        '/api/search/autocomplete?q=vat&limit=5',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    await waitFor(() => {
      const suggestion = result.current.suggestions[0];
      expect(suggestion).toBeDefined();
      expect(suggestion.id).toBe('doc-1');
      // Should use _formatted title (with <mark> tags)
      expect(suggestion.title).toBe('<mark>VAT</mark> refund for digital services');
      expect(suggestion.caseNumber).toBe('II CSK 123/25');
      expect(suggestion.jurisdiction).toBe('PL');
      expect(suggestion.courtName).toBe('Supreme Court');
      expect(suggestion.decisionDate).toBe('2025-06-01');
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

  it('falls back to non-formatted fields when _formatted is absent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 'doc-2',
            title: 'Employment law case',
            summary: 'Worker rights dispute',
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('employment', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      const suggestion = result.current.suggestions[0];
      expect(suggestion).toBeDefined();
      expect(suggestion.title).toBe('Employment law case');
      expect(suggestion.summary).toBe('Worker rights dispute');
      expect(suggestion.caseNumber).toBeUndefined();
    });
  });
});

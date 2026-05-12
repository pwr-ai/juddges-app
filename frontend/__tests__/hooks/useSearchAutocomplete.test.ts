/**
 * Hook tests for useSearchAutocomplete (topics-only)
 *
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { pickTopicLabel, useSearchAutocomplete, type TopicHit } from '@/hooks/useSearchAutocomplete';

describe('useSearchAutocomplete Hook', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces requests and surfaces topic hits from the API', async () => {
    const topicFixture: TopicHit = {
      id: 'consumer_credit',
      label_pl: 'Kredyty frankowe',
      label_en: 'Swiss-franc loans',
      aliases_pl: [],
      aliases_en: [],
      category: 'consumer_credit',
      doc_count: 142,
      jurisdictions: ['pl'],
      _formatted: { label_pl: '<mark>Kred</mark>yty frankowe' },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ topic_hits: [topicFixture] }),
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
      expect(result.current.topicHits).toHaveLength(1);
      expect(result.current.topicHits[0].id).toBe('consumer_credit');
      expect(result.current.topicHits[0].label_pl).toBe('Kredyty frankowe');
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
    expect(result.current.topicHits).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('defaults topicHits to [] when the API omits the field', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('tax', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.topicHits).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('clears topic hits when fetch returns a non-OK response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('tax', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.topicHits).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe('pickTopicLabel', () => {
  const hit: TopicHit = {
    id: 'homicide',
    label_pl: 'Zabójstwo',
    label_en: 'Homicide',
    aliases_pl: [],
    aliases_en: [],
    category: 'violent_crime',
    doc_count: 237,
    jurisdictions: ['pl', 'uk'],
  };

  it('returns label_pl as primary and label_en as secondary for locale "pl"', () => {
    const result = pickTopicLabel(hit, 'pl');
    expect(result).toEqual({ primary: 'Zabójstwo', secondary: 'Homicide' });
  });

  it('returns label_en as primary and label_pl as secondary for locale "en"', () => {
    const result = pickTopicLabel(hit, 'en');
    expect(result).toEqual({ primary: 'Homicide', secondary: 'Zabójstwo' });
  });

  it('defaults to en-order for an unknown locale', () => {
    const result = pickTopicLabel(hit, 'de');
    expect(result).toEqual({ primary: 'Homicide', secondary: 'Zabójstwo' });
  });

  it('treats BCP-47 region-qualified "pl-PL" as pl-primary', () => {
    const result = pickTopicLabel(hit, 'pl-PL');
    expect(result).toEqual({ primary: 'Zabójstwo', secondary: 'Homicide' });
  });

  it('treats uppercase "PL" as pl-primary', () => {
    const result = pickTopicLabel(hit, 'PL');
    expect(result).toEqual({ primary: 'Zabójstwo', secondary: 'Homicide' });
  });
});

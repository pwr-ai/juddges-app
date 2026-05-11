/**
 * Hook tests for useSearchAutocomplete
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

  it('surfaces topicHits when the API returns them', async () => {
    const topicFixture: TopicHit = {
      id: 'drug_trafficking',
      label_pl: 'Handel narkotykami',
      label_en: 'Drug trafficking',
      aliases_pl: ['narkomania'],
      aliases_en: ['narcotics'],
      category: 'drug_offences',
      doc_count: 247,
      jurisdictions: ['pl', 'uk'],
      _formatted: { label_pl: '<mark>Handel</mark> narkotykami' },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [],
        topic_hits: [topicFixture],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('handel', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.topicHits).toHaveLength(1);
      const topic = result.current.topicHits[0];
      expect(topic.id).toBe('drug_trafficking');
      expect(topic.label_pl).toBe('Handel narkotykami');
      expect(topic.label_en).toBe('Drug trafficking');
      expect(topic.doc_count).toBe(247);
      expect(topic.jurisdictions).toEqual(['pl', 'uk']);
    });
  });

  it('defaults topicHits to [] when the API omits the field', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 'doc-3',
            title: 'Tax law judgment',
          },
        ],
        // topic_hits intentionally absent
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('tax', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.topicHits).toEqual([]);
      expect(result.current.suggestions).toHaveLength(1);
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

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

  it('debounces requests and maps backend judgment hits into suggestions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 'doc-1',
            title: 'Kredyty frankowe',
            case_number: 'I CSK 1/22',
            court_name: 'Sąd Najwyższy',
          },
          {
            id: 'doc-2',
            title: 'Kredyt mieszkaniowy',
            summary: 'Decyzja w sprawie kredytu',
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
      expect(first.id).toBe('doc-1');
      expect(first.title).toBe('Kredyty frankowe');
      expect(first.caseNumber).toBe('I CSK 1/22');
      expect(first.courtName).toBe('Sąd Najwyższy');
      expect(second.title).toBe('Kredyt mieszkaniowy');
      expect(second.summary).toBe('Decyzja w sprawie kredytu');
    });
  });

  it('drops hits with empty titles or missing ids', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          { id: 'doc-empty', title: '   ' },
          { title: 'no-id title' },
          {
            id: 'doc-keep',
            title: 'art. 720 k.c.',
            summary: 'Pożyczka',
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
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe('doc-keep');
      expect(result.current.suggestions[0].title).toBe('art. 720 k.c.');
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

  it('prefers _formatted highlighted fields over raw fields when present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        hits: [
          {
            id: 'doc-fmt',
            title: 'Prawo pracy',
            _formatted: { title: '<mark>Prawo</mark> pracy' },
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useSearchAutocomplete('prawo', { enabled: true, debounceMs: 50, limit: 5 })
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.suggestions[0]).toEqual(
        expect.objectContaining({
          id: 'doc-fmt',
          title: '<mark>Prawo</mark> pracy',
        })
      );
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

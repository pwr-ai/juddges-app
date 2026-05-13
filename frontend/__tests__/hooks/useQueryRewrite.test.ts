import { renderHook, act } from '@testing-library/react';

import { useQueryRewrite } from '@/hooks/useQueryRewrite';
import { useSearchStore } from '@/lib/store/searchStore';

const buildEnvelope = (overrides: Partial<Record<string, unknown>> = {}) => ({
  rewritten_query: 'VAT digital services',
  filters: {
    base: { base_num_victims: { min: 3 } },
    facets: { jurisdiction: 'PL' },
    arrays: { keywords: ['VAT'], legal_topics: [], cited_legislation: [] },
    decision_date: { from: '2022-01-01', to: '2022-12-31' },
    languages: ['pl'],
  },
  diagnostics: { dropped_terms: [], latency_ms: 100, model: 'gpt-5-mini' },
  degraded: false,
  ...overrides,
});

describe('useQueryRewrite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useSearchStore.getState().resetFilters();
    useSearchStore.getState().resetBaseFilters();
    useSearchStore.getState().setSelectedLanguages(new Set(['pl', 'uk']));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('hydrates the store with envelope filters and returns rewritten query', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(buildEnvelope()), { status: 200 }),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useQueryRewrite());

    let envelope;
    await act(async () => {
      envelope = await result.current.run({ query: 'podatek VAT z 2022' });
    });

    expect(envelope?.rewritten_query).toBe('VAT digital services');

    const state = useSearchStore.getState();
    expect(state.baseFilters.numVictims).toEqual({ min: 3 });
    expect(Array.from(state.filters.issuingBodies)).toEqual([]); // facets sidebar untouched
    expect(Array.from(state.filters.keywords)).toEqual(['VAT']);
    expect(state.filters.dateFrom?.toISOString().startsWith('2022-01-01')).toBe(true);
    expect(Array.from(state.selectedLanguages)).toEqual(['pl']);
  });

  it('does not mutate the store when envelope is degraded', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify(buildEnvelope({ degraded: true, filters: undefined })),
        { status: 200 },
      ),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useQueryRewrite());

    let envelope;
    await act(async () => {
      envelope = await result.current.run({ query: 'x' });
    });

    expect(envelope?.degraded).toBe(true);
    const state = useSearchStore.getState();
    expect(state.baseFilters).toEqual({});
    expect(state.filters.keywords.size).toBe(0);
  });
});

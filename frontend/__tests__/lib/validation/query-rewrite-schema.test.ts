import {
  queryRewriteRequestSchema,
  queryRewriteEnvelopeSchema,
} from '@/lib/validation/query-rewrite-schema';

describe('query rewrite schemas', () => {
  it('accepts a minimal request', () => {
    expect(() =>
      queryRewriteRequestSchema.parse({ query: 'podatek VAT' }),
    ).not.toThrow();
  });

  it('rejects empty query', () => {
    expect(() => queryRewriteRequestSchema.parse({ query: '   ' })).toThrow();
  });

  it('parses a full envelope', () => {
    const parsed = queryRewriteEnvelopeSchema.parse({
      rewritten_query: 'VAT',
      filters: {
        base: { base_num_victims: { min: 1 } },
        facets: { jurisdiction: 'PL' },
        arrays: { keywords: ['VAT'], legal_topics: [], cited_legislation: [] },
        decision_date: { from: '2020-01-01', to: '2024-12-31' },
        languages: ['pl'],
      },
      diagnostics: { dropped_terms: [], latency_ms: 200, model: 'gpt-5-mini' },
      degraded: false,
    });
    expect(parsed.filters.facets.jurisdiction).toBe('PL');
  });

  it('treats missing optional sections as defaults', () => {
    const parsed = queryRewriteEnvelopeSchema.parse({
      rewritten_query: 'fallback',
      degraded: true,
    });
    expect(parsed.filters.arrays.keywords).toEqual([]);
    expect(parsed.filters.languages).toEqual([]);
  });
});

import { coveragePercent, toShareChart } from '@/lib/compare/chart-data';
import type { CompareField } from '@/lib/compare/types';

const field: CompareField = {
  field: 'appeal_outcome', label: 'Appeal Outcome', source: 'base', kind: 'enum_array',
  coverage: { PL: { covered: 153, total: 200, ratio: 0.765 }, UK: { covered: 198, total: 200, ratio: 0.99 } },
  tier: 'partial', missing_in: [],
  values: [
    { value: 'outcome_dismissed_or_refused', counts: { PL: 100, UK: 99 }, shares: { PL: 0.6536, UK: 0.5 } },
    { value: 'outcome_other', counts: { PL: 0, UK: 5 }, shares: { PL: 0, UK: 0.0253 } },
  ],
};

describe('toShareChart', () => {
  it('turns shares into percentages with human labels, keeping backend order', () => {
    const chart = toShareChart(field, (f, v) => `${f}:${v}`);
    expect(chart.categories).toEqual(['appeal_outcome:outcome_dismissed_or_refused', 'appeal_outcome:outcome_other']);
    expect(chart.plData).toEqual([65.4, 0]);
    expect(chart.ukData).toEqual([50, 2.5]);
  });

  it('maps a null share to 0 so Plotly draws no bar rather than NaN', () => {
    const chart = toShareChart({ ...field, values: [{ value: 'x', counts: { PL: 0, UK: 1 }, shares: { PL: null, UK: 1 } }] }, (_f, v) => v);
    expect(chart.plData).toEqual([0]);
  });
});

describe('coveragePercent', () => {
  it('rounds to a whole percent and passes null through', () => {
    expect(coveragePercent({ covered: 153, total: 200, ratio: 0.765 })).toBe(77);
    expect(coveragePercent({ covered: 0, total: 0, ratio: null })).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';

import { OutcomeTimeline } from '@/components/reasoning-lines/OutcomeTimeline';
import type { ReasoningLineTimeline } from '@/types/reasoning-lines';

// recharts (+ d3 ESM) cannot be transformed by jest here and the chart is
// irrelevant to the trend badge — stub it out.
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

function timeline(trend: string): ReasoningLineTimeline {
  return {
    line_id: 'line-1',
    legal_question: 'Is the contract void?',
    points: [
      {
        period_label: '2019',
        start_date: '2019-01-01',
        end_date: '2019-12-31',
        total: 10,
        for_count: 2,
        against_count: 8,
        mixed_count: 0,
        procedural_count: 0,
        unclassified_count: 0,
        for_ratio: 0.2,
      },
      {
        period_label: '2021',
        start_date: '2021-01-01',
        end_date: '2021-12-31',
        total: 10,
        for_count: 8,
        against_count: 2,
        mixed_count: 0,
        procedural_count: 0,
        unclassified_count: 0,
        for_ratio: 0.8,
      },
    ],
    trend,
    trend_slope: 0.064,
    total_classified: 20,
    total_unclassified: 0,
  };
}

// Regression for #630: the backend's trend vocabulary is emerging_consensus,
// stable_split, shifting, insufficient_data. The badge used a key that the
// backend never emits, so a flipped line was labelled "insufficient data".
describe('OutcomeTimeline trend badge', () => {
  it.each([
    ['shifting', 'Zmiana kierunku'],
    ['emerging_consensus', 'Ksztaltujacy sie konsensus'],
    ['stable_split', 'Stabilny podzial'],
    ['insufficient_data', 'Niewystarczajace dane'],
  ])('labels trend %s as %s', (trend, label) => {
    render(<OutcomeTimeline data={timeline(trend)} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('does not show the insufficient-data badge for a shifting line', () => {
    render(<OutcomeTimeline data={timeline('shifting')} />);

    expect(screen.queryByText('Niewystarczajace dane')).not.toBeInTheDocument();
  });
});

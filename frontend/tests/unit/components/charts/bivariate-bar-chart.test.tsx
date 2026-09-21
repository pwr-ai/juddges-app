/**
 * BivariateBarChart is the shared PL/UK grouped-bar figure. Plotly is
 * dynamically imported and useless under jsdom, so the dynamic loader is
 * mocked with a probe that dumps the props it receives.
 */
import { render, screen } from '@testing-library/react';

jest.mock('next/dynamic', () => () => {
  const Probe = (props: Record<string, unknown>) => (
    <pre data-testid="plot">{JSON.stringify({ data: props.data, layout: props.layout })}</pre>
  );
  Probe.displayName = 'PlotProbe';
  return Probe;
});

import { BivariateBarChart } from '@/components/charts/BivariateBarChart';
import { editorialSeries } from '@/lib/charts/editorial-plot';

function plotProps() {
  return JSON.parse(screen.getByTestId('plot').textContent ?? '{}');
}

describe('BivariateBarChart', () => {
  it('renders one UK trace and one PL trace with editorial colours', () => {
    render(<BivariateBarChart categories={['a', 'b']} ukData={[1, 2]} plData={[3, 4]} />);
    const { data } = plotProps();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe('UK');
    expect(data[0].marker.color).toBe(editorialSeries.uk);
    expect(data[1].name).toBe('Poland');
    expect(data[1].marker.color).toBe(editorialSeries.pl);
  });

  it('applies yTickSuffix and hoverTemplate for percentage charts', () => {
    render(
      <BivariateBarChart
        categories={['a']} ukData={[50]} plData={[25]}
        yTickSuffix="%" hoverTemplate="%{y:.1f}%<extra>%{fullData.name}</extra>"
      />,
    );
    const { data, layout } = plotProps();
    expect(layout.yaxis.ticksuffix).toBe('%');
    expect(data[0].hovertemplate).toContain('%{y:.1f}%');
  });

  it('is still importable from the dataset-comparison private folder', async () => {
    const legacy = await import('@/app/dataset-comparison/_components/BivariateBarChart');
    expect(legacy.BivariateBarChart).toBe(BivariateBarChart);
  });
});

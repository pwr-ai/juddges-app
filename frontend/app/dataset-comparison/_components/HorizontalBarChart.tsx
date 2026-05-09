'use client';

import dynamic from 'next/dynamic';
import {
  editorialPlotConfig,
  editorialPlotLayout,
} from '@/lib/charts/editorial-plot';

const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

export interface HorizontalBarItem {
  /** Y-axis label. */
  name: string;
  /** Bar length on the X axis. */
  count: number;
}

interface HorizontalBarChartProps {
  /** Items already sorted in display order (top-most first). The component
   *  reverses them internally for Plotly's bottom-to-top y-axis. */
  items: HorizontalBarItem[];
  /** Bar fill color — pass `editorialSeries.uk`, `editorialSeries.pl`, etc. */
  color: string;
  /** X-axis label. */
  xAxisTitle?: string;
  /** Left-side margin in px — wide enough to fit the longest label. */
  leftMargin?: number;
  /** Plot height in px. */
  height?: number;
  /** Show count next to each bar (mono outside text). Defaults to `false`. */
  showCounts?: boolean;
  /** Color of the outside count labels (defaults to `color`). */
  countColor?: string;
}

/**
 * Editorial horizontal-bar chart — single source of truth for ranked
 * horizontal-bar Plotly figures on this page (court breakdowns, vocabulary,
 * crime tags). Wraps the layout/styling so call-sites only own data + width.
 */
export function HorizontalBarChart({
  items,
  color,
  xAxisTitle = 'Cases',
  leftMargin = 200,
  height = 320,
  showCounts = false,
  countColor,
}: HorizontalBarChartProps) {
  const reversed = [...items].reverse();

  const trace: Record<string, unknown> = {
    y: reversed.map(item => item.name),
    x: reversed.map(item => item.count),
    type: 'bar',
    orientation: 'h',
    marker: { color },
  };

  if (showCounts) {
    trace.text = reversed.map(item => item.count.toLocaleString());
    trace.textposition = 'outside';
    trace.textfont = {
      family: 'Geist Mono, ui-monospace, monospace',
      size: 11,
      color: countColor ?? color,
    };
  }

  return (
    <Plot
      data={[trace]}
      layout={{
        ...editorialPlotLayout,
        xaxis: { ...editorialPlotLayout.xaxis, title: { text: xAxisTitle } },
        yaxis: { ...editorialPlotLayout.yaxis, automargin: true },
        margin: { ...editorialPlotLayout.margin, l: leftMargin },
        height,
        showlegend: false,
      }}
      config={editorialPlotConfig}
      className="w-full"
      useResizeHandler
      style={{ width: '100%' }}
    />
  );
}

export default HorizontalBarChart;

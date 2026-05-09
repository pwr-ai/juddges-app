'use client';

import dynamic from 'next/dynamic';
import {
  editorialPlotConfig,
  editorialPlotLayout,
  editorialSeries,
} from '@/lib/charts/editorial-plot';

const Plot = dynamic(
  async () => {
    const plotly = await import('plotly.js-dist');
    const createPlotlyComponent = (await import('react-plotly.js/factory')).default;
    return createPlotlyComponent(plotly);
  },
  { ssr: false }
);

interface BivariateBarChartProps {
  /** Shared X-axis category labels (year, bucket, panel size). */
  categories: Array<string | number>;
  /** UK series values — same length as `categories`. */
  ukData: number[];
  /** PL series values — same length as `categories`. */
  plData: number[];
  /** Optional series legends — defaults to "UK" / "Poland". */
  ukName?: string;
  plName?: string;
  /** Optional axis labels. */
  xAxisTitle?: string;
  yAxisTitle?: string;
  /** Plot height in px. */
  height?: number;
  /** Tick angle for the X axis (e.g. `-45` for dense year labels). */
  tickAngle?: number;
  /** Tick spacing for X axis (passed through to Plotly's `dtick`). */
  dtick?: number | string;
  /** Show value labels above each bar (mono outside text). */
  showCounts?: boolean;
}

/**
 * Editorial grouped-bar chart — UK ink vs PL oxblood, side-by-side. Used for
 * year-by-year, length-bucket, panel-size, and decade comparisons. Owns the
 * shared color tokens so palette stays consistent across all bivariate
 * comparison figures.
 */
export function BivariateBarChart({
  categories,
  ukData,
  plData,
  ukName = 'UK',
  plName = 'Poland',
  xAxisTitle,
  yAxisTitle = 'Cases',
  height = 360,
  tickAngle,
  dtick,
  showCounts = false,
}: BivariateBarChartProps) {
  const ukTrace: Record<string, unknown> = {
    x: categories,
    y: ukData,
    type: 'bar',
    name: ukName,
    marker: { color: editorialSeries.uk },
  };
  const plTrace: Record<string, unknown> = {
    x: categories,
    y: plData,
    type: 'bar',
    name: plName,
    marker: { color: editorialSeries.pl },
  };

  if (showCounts) {
    const baseFont = {
      family: 'Geist Mono, ui-monospace, monospace',
      size: 11,
    };
    ukTrace.text = ukData.map(v => v.toLocaleString());
    ukTrace.textposition = 'outside';
    ukTrace.textfont = { ...baseFont, color: editorialSeries.uk };
    plTrace.text = plData.map(v => v.toLocaleString());
    plTrace.textposition = 'outside';
    plTrace.textfont = { ...baseFont, color: editorialSeries.pl };
  }

  const xaxis: Record<string, unknown> = { ...editorialPlotLayout.xaxis };
  if (xAxisTitle) xaxis.title = { text: xAxisTitle };
  if (tickAngle != null) xaxis.tickangle = tickAngle;
  if (dtick != null) xaxis.dtick = dtick;

  return (
    <Plot
      data={[ukTrace, plTrace]}
      layout={{
        ...editorialPlotLayout,
        barmode: 'group',
        xaxis,
        yaxis: { ...editorialPlotLayout.yaxis, title: { text: yAxisTitle } },
        height,
      }}
      config={editorialPlotConfig}
      className="w-full"
      useResizeHandler
      style={{ width: '100%' }}
    />
  );
}

export default BivariateBarChart;

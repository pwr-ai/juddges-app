'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import type { OutcomeKey, ReasoningLineTimeline, TimelinePoint } from '@/types/reasoning-lines';
import { ChartFigure } from '@/components/editorial';
import { OUTCOME_SERIES, rechartsTheme } from '@/lib/charts/reasoning-palette';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Color mapping for outcome categories — see lib/charts/reasoning-palette.ts */
const OUTCOME_COLORS = OUTCOME_SERIES;

/** Default Polish labels for outcome categories; a line can override them
 *  through `outcome_labels` (e.g. "Kredytobiorca wygrywa" / "Bank wygrywa"). */
const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  for: 'Za',
  against: 'Przeciw',
  mixed: 'Mieszane',
  procedural: 'Proceduralne',
};

/** Stacking order of the bars, bottom to top */
const OUTCOME_KEYS: readonly OutcomeKey[] = ['for', 'against', 'mixed', 'procedural'];

/** Tooltip text for one series: count and its share of the period's
 *  classified judgments, e.g. "720 (88%)". */
function formatShare(count: number, classified: number): string {
  if (classified <= 0) return `${count}`;
  return `${count} (${Math.round((count / classified) * 100)}%)`;
}

/** Polish labels for the backend trend vocabulary (app/reasoning_lines/schemas.py);
 *  `color` is the text tone on a rule-bordered pill */
const TREND_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  emerging_consensus: {
    label: 'Ksztaltujacy sie konsensus',
    icon: TrendingUp,
    color: 'text-ink',
  },
  stable_split: {
    label: 'Stabilny podzial',
    icon: Minus,
    color: 'text-gold',
  },
  shifting: {
    label: 'Zmiana kierunku',
    icon: TrendingDown,
    color: 'text-oxblood',
  },
  insufficient_data: {
    label: 'Niewystarczajace dane',
    icon: AlertTriangle,
    color: 'text-ink-soft',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OutcomeTimelineProps {
  data: ReasoningLineTimeline;
  /** Chart height in pixels */
  height?: number;
}

export function OutcomeTimeline({ data, height = 320 }: OutcomeTimelineProps) {
  const labels = useMemo(
    () => ({ ...OUTCOME_LABELS, ...(data.outcome_labels ?? {}) }),
    [data.outcome_labels]
  );

  // Transform timeline points for recharts. Series keys stay stable
  // (for/against/...); the visible names come from `labels`.
  const chartData = useMemo(
    () =>
      data.points.map((point: TimelinePoint) => ({
        name: point.period_label,
        for: point.for_count,
        against: point.against_count,
        mixed: point.mixed_count,
        procedural: point.procedural_count,
        // Keep raw data for tooltip; shares are of classified judgments,
        // the same base the 100% bars are normalised to.
        _classified:
          point.for_count + point.against_count + point.mixed_count + point.procedural_count,
        _total: point.total,
        _forRatio: point.for_ratio,
      })),
    [data.points]
  );

  const trendInfo = TREND_CONFIG[data.trend] ?? TREND_CONFIG.insufficient_data;
  const TrendIcon = trendInfo.icon;

  if (data.points.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Brak danych do wyswietlenia. Sklasyfikuj orzeczenia, aby zobaczyc os czasu.
      </div>
    );
  }

  return (
    <ChartFigure>
      <div className="space-y-3">
        {/* Trend badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 border border-rule px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${trendInfo.color}`}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            {trendInfo.label}
          </span>
          {data.trend_slope !== 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              (nachylenie: {data.trend_slope > 0 ? '+' : ''}
              {data.trend_slope.toFixed(2)})
            </span>
          )}
        </div>

        {/* Chart */}
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {/* stackOffset="expand": every period is a 100% bar, so years with
                few judgments compare on share, not on volume. */}
            <BarChart
              data={chartData}
              stackOffset="expand"
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.grid} />
              <XAxis
                dataKey="name"
                tick={{ fill: rechartsTheme.tick, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: rechartsTheme.axis }}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                tick={{ fill: rechartsTheme.tick, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: rechartsTheme.axis }}
              />
              <Tooltip
                contentStyle={rechartsTheme.tooltip}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any, item: any) => [
                  formatShare(Number(value), item?.payload?._classified ?? 0),
                  name,
                ]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => `Okres: ${label}`}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              {OUTCOME_KEYS.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={labels[key]}
                  stackId="outcomes"
                  fill={OUTCOME_COLORS[`${key}_count`]}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartFigure>
  );
}

export { OUTCOME_COLORS, OUTCOME_LABELS, TREND_CONFIG, formatShare };

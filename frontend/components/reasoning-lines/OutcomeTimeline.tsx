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
import type { ReasoningLineTimeline, TimelinePoint } from '@/types/reasoning-lines';
import { editorialPalette } from '@/lib/charts/editorial-plot';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Color mapping for outcome categories using Editorial palette */
const OUTCOME_COLORS = {
  for_count: editorialPalette.ink,
  against_count: editorialPalette.oxblood,
  mixed_count: editorialPalette.gold,
  procedural_count: editorialPalette.ruleStrong,
} as const;

/** Polish labels for outcome categories */
const OUTCOME_LABELS: Record<string, string> = {
  for_count: 'Za',
  against_count: 'Przeciw',
  mixed_count: 'Mieszane',
  procedural_count: 'Proceduralne',
};

/** Polish labels for trend values */
const TREND_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  emerging_consensus: {
    label: 'Kształtujący się konsensus',
    icon: TrendingUp,
    color: 'border-rule text-ink',
  },
  stable_split: {
    label: 'Stabilny podział',
    icon: Minus,
    color: 'border-rule text-gold',
  },
  direction_change: {
    label: 'Zmiana kierunku',
    icon: TrendingDown,
    color: 'border-rule text-oxblood',
  },
  insufficient_data: {
    label: 'Niewystarczające dane',
    icon: AlertTriangle,
    color: 'border-rule text-ink-soft',
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
  // Transform timeline points for recharts
  const chartData = useMemo(
    () =>
      data.points.map((point: TimelinePoint) => ({
        name: point.period_label,
        Za: point.for_count,
        Przeciw: point.against_count,
        Mieszane: point.mixed_count,
        Proceduralne: point.procedural_count,
        // Keep raw data for tooltip
        _total: point.total,
        _forRatio: point.for_ratio,
      })),
    [data.points]
  );

  const trendInfo = TREND_CONFIG[data.trend] ?? TREND_CONFIG.insufficient_data;
  const TrendIcon = trendInfo.icon;

  if (data.points.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-ink-soft">
        Brak danych do wyświetlenia. Sklasyfikuj orzeczenia, aby zobaczyć oś czasu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Trend badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 border text-xs font-mono uppercase',
            trendInfo.color
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          {trendInfo.label}
        </span>
        {data.trend_slope !== 0 && (
          <span className="text-xs font-mono text-ink-soft tabular-nums">
            (nachylenie: {data.trend_slope > 0 ? '+' : ''}
            {data.trend_slope.toFixed(2)})
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={editorialPalette.rule} />
            <XAxis
              dataKey="name"
              tick={{ fill: editorialPalette.ink, fontSize: 11, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: editorialPalette.rule }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: editorialPalette.ink, fontSize: 11, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: editorialPalette.rule }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--parchment)',
                border: '1px solid var(--rule)',
                borderRadius: '0px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: editorialPalette.ink,
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${value}`]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => `Okres: ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace', paddingTop: '8px' }}
            />
            <Bar
              dataKey="Za"
              stackId="outcomes"
              fill={OUTCOME_COLORS.for_count}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Przeciw"
              stackId="outcomes"
              fill={OUTCOME_COLORS.against_count}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Mieszane"
              stackId="outcomes"
              fill={OUTCOME_COLORS.mixed_count}
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Proceduralne"
              stackId="outcomes"
              fill={OUTCOME_COLORS.procedural_count}
              radius={[0, 0, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { OUTCOME_COLORS, OUTCOME_LABELS, TREND_CONFIG };

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Color mapping for outcome categories */
const OUTCOME_COLORS = {
  for_count: '#16a34a',        // green-600
  against_count: '#dc2626',    // red-600
  mixed_count: '#d97706',      // amber-600
  procedural_count: '#6b7280', // gray-500
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
    label: 'Ksztaltujacy sie konsensus',
    icon: TrendingUp,
    color: 'bg-emerald-100 text-emerald-700',
  },
  stable_split: {
    label: 'Stabilny podzial',
    icon: Minus,
    color: 'bg-amber-100 text-amber-700',
  },
  direction_change: {
    label: 'Zmiana kierunku',
    icon: TrendingDown,
    color: 'bg-rose-100 text-rose-700',
  },
  insufficient_data: {
    label: 'Niewystarczajace dane',
    icon: AlertTriangle,
    color: 'bg-slate-100 text-slate-600',
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
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Brak danych do wyswietlenia. Sklasyfikuj orzeczenia, aby zobaczyc os czasu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Trend badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${trendInfo.color}`}
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
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${value}`]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => `Okres: ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
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
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { OUTCOME_COLORS, OUTCOME_LABELS, TREND_CONFIG };

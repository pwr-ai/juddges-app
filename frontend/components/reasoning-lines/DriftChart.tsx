'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { DriftAnalysisResponse, DriftWindow } from '@/types/reasoning-lines';
import { Badge } from '@/lib/styles/components';

// ---------------------------------------------------------------------------
// Custom dot renderer for the Area chart
// ---------------------------------------------------------------------------

/** Renders peak dots in red and regular dots in blue */
function DriftDot({
  cx,
  cy,
  index,
  peakIndices,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  peakIndices: Set<number>;
}) {
  if (cx == null || cy == null || index == null) return null;

  if (peakIndices.has(index)) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#dc2626"
        stroke="#fff"
        strokeWidth={2}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill="#3b82f6"
      stroke="#fff"
      strokeWidth={1}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DriftChartProps {
  data: DriftAnalysisResponse;
  /** Chart height in pixels */
  height?: number;
}

export function DriftChart({ data, height = 300 }: DriftChartProps) {
  // Build chart data from windows
  const chartData = useMemo(
    () =>
      data.windows.map((w: DriftWindow) => ({
        name: `${w.period_start.slice(0, 7)}`,
        drift: Number(w.drift_score.toFixed(4)),
        case_count: w.case_count,
        // Flag peaks for visual emphasis
        isPeak: data.peaks.some((p) => p.window_index === w.window_index),
      })),
    [data.windows, data.peaks]
  );

  // Peak window indices for reference lines
  const peakIndices = useMemo(
    () => new Set(data.peaks.map((p) => p.window_index)),
    [data.peaks]
  );

  if (data.windows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Brak danych do analizy dryfu. Wymagane co najmniej 2 okna czasowe.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 tabular-nums">
          Sredni dryf: {data.avg_drift.toFixed(3)}
        </span>
        <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 tabular-nums">
          Maks. dryf: {data.max_drift.toFixed(3)}
        </span>
        <span className="px-2 py-1 rounded bg-slate-50 text-slate-700 tabular-nums">
          Analizowanych spraw: {data.total_members_analyzed}
        </span>
        {data.drift_events_created > 0 && (
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 tabular-nums">
            Wykrytych zdarzen: {data.drift_events_created}
          </span>
        )}
      </div>

      {/* Area chart */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="driftGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${Number(value).toFixed(4)}`, 'Dryf']}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => `Okres: ${label}`}
            />

            {/* Average drift reference line */}
            <ReferenceLine
              y={data.avg_drift}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{
                value: 'Srednia',
                position: 'insideTopRight',
                fill: '#6b7280',
                fontSize: 10,
              }}
            />

            {/* Vertical reference lines at peaks */}
            {chartData.map((point, idx) =>
              peakIndices.has(idx) ? (
                <ReferenceLine
                  key={`peak-${idx}`}
                  x={point.name}
                  stroke="#dc2626"
                  strokeDasharray="3 3"
                  strokeOpacity={0.6}
                />
              ) : null
            )}

            <Area
              type="monotone"
              dataKey="drift"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#driftGradient)"
              dot={<DriftDot peakIndices={peakIndices} />}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Peak detail cards */}
      {data.peaks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Wykryte skoki dryfu ({data.peaks.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.peaks.map((peak) => (
              <div
                key={peak.window_index}
                className="p-3 rounded-xl border border-rose-100 bg-rose-50/30"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {peak.period_start.slice(0, 10)} - {peak.period_end.slice(0, 10)}
                  </span>
                  <span className="text-xs font-semibold text-rose-600 tabular-nums">
                    {peak.drift_score.toFixed(3)}
                  </span>
                </div>

                {/* Entering keywords */}
                {peak.entering_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {peak.entering_keywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0"
                      >
                        + {kw}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Exiting keywords */}
                {peak.exiting_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {peak.exiting_keywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0"
                      >
                        - {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

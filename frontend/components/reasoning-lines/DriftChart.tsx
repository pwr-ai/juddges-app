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
import { editorialPalette } from '@/lib/charts/editorial-plot';

// ---------------------------------------------------------------------------
// Custom dot renderer for the Area chart
// ---------------------------------------------------------------------------

/** Renders peak dots in oxblood and regular dots in ink */
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
        fill={editorialPalette.oxblood}
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
      fill={editorialPalette.ink}
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
      <div className="flex items-center justify-center py-8 text-sm text-ink-soft">
        Brak danych do analizy dryfu. Wymagane co najmniej 2 okna czasowe.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
        <span className="px-2 py-1 border border-rule text-ink tabular-nums">
          Średni dryf: {data.avg_drift.toFixed(3)}
        </span>
        <span className="px-2 py-1 border border-rule text-oxblood tabular-nums">
          Maks. dryf: {data.max_drift.toFixed(3)}
        </span>
        <span className="px-2 py-1 border border-rule text-ink-soft tabular-nums">
          Analizowanych spraw: {data.total_members_analyzed}
        </span>
        {data.drift_events_created > 0 && (
          <span className="px-2 py-1 border border-rule text-gold tabular-nums">
            Wykrytych zdarzeń: {data.drift_events_created}
          </span>
        )}
      </div>

      {/* Area chart */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="driftGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={editorialPalette.oxblood} stopOpacity={0.25} />
                <stop offset="50%" stopColor={editorialPalette.ink} stopOpacity={0.12} />
                <stop offset="95%" stopColor={editorialPalette.ink} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={editorialPalette.rule} />
            <XAxis
              dataKey="name"
              tick={{ fill: editorialPalette.ink, fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: editorialPalette.rule }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: editorialPalette.ink, fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: editorialPalette.rule }}
              domain={[0, 'auto']}
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
              formatter={(value: any) => [`${Number(value).toFixed(4)}`, 'Dryf']}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => `Okres: ${label}`}
            />

            {/* Average drift reference line */}
            <ReferenceLine
              y={data.avg_drift}
              stroke={editorialPalette.inkSoft}
              strokeDasharray="4 4"
              label={{
                value: 'Średnia',
                position: 'insideTopRight',
                fill: editorialPalette.inkSoft,
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            />

            {/* Vertical reference lines at peaks */}
            {chartData.map((point, idx) =>
              peakIndices.has(idx) ? (
                <ReferenceLine
                  key={`peak-${idx}`}
                  x={point.name}
                  stroke={editorialPalette.oxblood}
                  strokeDasharray="3 3"
                  strokeOpacity={0.7}
                />
              ) : null
            )}

            <Area
              type="monotone"
              dataKey="drift"
              stroke={editorialPalette.ink}
              strokeWidth={1.5}
              fill="url(#driftGradient)"
              dot={<DriftDot peakIndices={peakIndices} />}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Peak detail cards */}
      {data.peaks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-ink-soft">
            Wykryte skoki dryfu ({data.peaks.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.peaks.map((peak) => (
              <div
                key={peak.window_index}
                className="p-3 rounded-none border border-rule bg-parchment"
              >
                <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
                  <span className="text-ink">
                    {peak.period_start.slice(0, 10)} – {peak.period_end.slice(0, 10)}
                  </span>
                  <span className="font-semibold text-oxblood tabular-nums">
                    {peak.drift_score.toFixed(3)}
                  </span>
                </div>

                {/* Entering keywords */}
                {peak.entering_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {peak.entering_keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] font-mono border border-rule text-ink px-1.5 py-0"
                      >
                        + {kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* Exiting keywords */}
                {peak.exiting_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {peak.exiting_keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] font-mono border border-rule text-oxblood px-1.5 py-0"
                      >
                        - {kw}
                      </span>
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

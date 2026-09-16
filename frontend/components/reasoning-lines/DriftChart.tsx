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
import { ChartFigure } from '@/components/editorial';
import { editorialPalette } from '@/lib/charts/editorial-plot';
import { rechartsTheme } from '@/lib/charts/reasoning-palette';

const STAT_PILL =
  'inline-flex items-center border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-wider tabular-nums';

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
        stroke={editorialPalette.parchment}
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
      stroke={editorialPalette.parchment}
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
    <ChartFigure>
      <div className="space-y-4">
        {/* Summary stats */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${STAT_PILL} text-ink`}>
            Sredni dryf: {data.avg_drift.toFixed(3)}
          </span>
          <span className={`${STAT_PILL} text-oxblood`}>
            Maks. dryf: {data.max_drift.toFixed(3)}
          </span>
          <span className={`${STAT_PILL} text-ink-soft`}>
            Analizowanych spraw: {data.total_members_analyzed}
          </span>
          {data.drift_events_created > 0 && (
            <span className={`${STAT_PILL} text-gold`}>
              Wykrytych zdarzen: {data.drift_events_created}
            </span>
          )}
        </div>

        {/* Area chart */}
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.grid} />
              <XAxis
                dataKey="name"
                tick={{ fill: rechartsTheme.tick, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: rechartsTheme.axis }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: rechartsTheme.tick, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: rechartsTheme.axis }}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={rechartsTheme.tooltip}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${Number(value).toFixed(4)}`, 'Dryf']}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => `Okres: ${label}`}
              />

              {/* Average drift reference line */}
              <ReferenceLine
                y={data.avg_drift}
                stroke={editorialPalette.ruleStrong}
                strokeDasharray="4 4"
                label={{
                  value: 'Srednia',
                  position: 'insideTopRight',
                  fill: editorialPalette.inkSoft,
                  fontSize: 10,
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
                    strokeOpacity={0.6}
                  />
                ) : null
              )}

              <Area
                type="monotone"
                dataKey="drift"
                stroke={editorialPalette.ink}
                strokeWidth={2}
                fill={editorialPalette.oxblood}
                fillOpacity={0.12}
                dot={<DriftDot peakIndices={peakIndices} />}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Peak detail cards */}
        {data.peaks.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Wykryte skoki dryfu ({data.peaks.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.peaks.map((peak) => (
                <div
                  key={peak.window_index}
                  className="p-3 border border-rule"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {peak.period_start.slice(0, 10)} - {peak.period_end.slice(0, 10)}
                    </span>
                    <span className="text-xs font-semibold text-oxblood tabular-nums">
                      {peak.drift_score.toFixed(3)}
                    </span>
                  </div>

                  {/* Entering keywords */}
                  {peak.entering_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {peak.entering_keywords.map((kw) => (
                        <Badge
                          key={kw}
                          variant="outline"
                          className="text-[10px] text-ink px-1.5 py-0"
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
                          variant="outline"
                          className="text-[10px] text-oxblood px-1.5 py-0"
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
    </ChartFigure>
  );
}

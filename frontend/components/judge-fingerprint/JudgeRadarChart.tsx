'use client';

import React, { useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { JudgeProfile, StyleScores } from '@/types/judge-fingerprint';

/** Polish labels for reasoning dimensions */
const DIMENSION_LABELS: Record<keyof StyleScores, string> = {
  textual: 'Tekstualna',
  deductive: 'Dedukcyjna',
  analogical: 'Analogiczna',
  policy: 'Celowosciowa',
  teleological: 'Teleologiczna',
};

/** Color palette for up to 3 judges */
const JUDGE_COLORS = [
  'hsl(210, 90%, 55%)',   // blue
  'hsl(340, 80%, 55%)',   // rose
  'hsl(160, 70%, 45%)',   // teal
];

interface RadarDataPoint {
  dimension: string;
  fullMark: number;
  [judgeName: string]: string | number;
}

interface JudgeRadarChartProps {
  /** One or more judge profiles to render on the same chart */
  profiles: JudgeProfile[];
  /** Chart height in pixels */
  height?: number;
}

export function JudgeRadarChart({ profiles, height = 350 }: JudgeRadarChartProps) {
  // Transform profile data into recharts-compatible format
  const chartData: RadarDataPoint[] = useMemo(() => {
    const dimensions: (keyof StyleScores)[] = [
      'textual',
      'deductive',
      'analogical',
      'policy',
      'teleological',
    ];

    return dimensions.map((dim) => {
      const point: RadarDataPoint = {
        dimension: DIMENSION_LABELS[dim],
        fullMark: 100,
      };
      for (const profile of profiles) {
        point[profile.judge_name] = profile.style_scores[dim];
      }
      return point;
    });
  }, [profiles]);

  if (profiles.length === 0) return null;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            tickCount={5}
          />

          {profiles.map((profile, idx) => (
            <Radar
              key={profile.judge_name}
              name={profile.judge_name}
              dataKey={profile.judge_name}
              stroke={JUDGE_COLORS[idx % JUDGE_COLORS.length]}
              fill={JUDGE_COLORS[idx % JUDGE_COLORS.length]}
              fillOpacity={profiles.length > 1 ? 0.15 : 0.25}
              strokeWidth={2}
            />
          ))}

          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [`${value}%`]}
          />

          {/* Only show legend when comparing multiple judges */}
          {profiles.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export { DIMENSION_LABELS, JUDGE_COLORS };

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
import { editorialPalette } from '@/lib/charts/editorial-plot';
import { useDimensionLabels } from './dimensionLabels';

/** Color palette for up to 3 judges using Editorial palette */
const JUDGE_COLORS = [
  editorialPalette.ink,
  editorialPalette.oxblood,
  editorialPalette.gold,
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
  const dimensionLabels = useDimensionLabels();

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
        dimension: dimensionLabels[dim],
        fullMark: 100,
      };
      for (const profile of profiles) {
        point[profile.judge_name] = profile.style_scores[dim];
      }
      return point;
    });
  }, [profiles, dimensionLabels]);

  if (profiles.length === 0) return null;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke={editorialPalette.rule} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: editorialPalette.ink, fontSize: 11, fontFamily: 'monospace' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: editorialPalette.inkSoft, fontSize: 10, fontFamily: 'monospace' }}
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
              strokeWidth={1.5}
            />
          ))}

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
            formatter={(value: any) => [`${value}%`]}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace', paddingTop: '8px' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default JudgeRadarChart;

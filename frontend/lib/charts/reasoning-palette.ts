/**
 * Semantic chart palette for the reasoning-line and judge-fingerprint
 * charts (#640 §4). Pure module — no recharts / canvas imports — so the
 * colour maps stay unit-testable while the chart components stay mocked.
 *
 * All values are literal hex from `editorialPalette`: recharts and canvas
 * write them into SVG attributes / `ctx.fillStyle`, where `var(--x)` does
 * not resolve.
 */

import type { DAGEdgeEventType, DAGNodeStatus } from '@/types/reasoning-lines';
import { editorialPalette } from './editorial-plot';

const { ink, inkSoft, parchment, rule, ruleStrong, oxblood, gold } = editorialPalette;

/** DAG node fill/stroke by status. Superseded lines render hollow. */
export const DAG_NODE_STYLE: Record<DAGNodeStatus, { fill: string; stroke: string }> = {
  active: { fill: oxblood, stroke: oxblood },
  merged: { fill: ink, stroke: ink },
  dormant: { fill: gold, stroke: gold },
  superseded: { fill: parchment, stroke: ruleStrong },
};

/**
 * DAG edge colour + dash pattern by event type. Dash is the second channel
 * so the four types stay distinguishable in a three-colour palette
 * (`ctx.setLineDash` / SVG `stroke-dasharray`; `[]` is solid).
 */
export const DAG_EDGE_STYLE: Record<DAGEdgeEventType, { color: string; dash: number[] }> = {
  branch: { color: oxblood, dash: [] },
  merge: { color: ink, dash: [] },
  influence: { color: inkSoft, dash: [6, 4] },
  drift: { color: gold, dash: [2, 3] },
};

/** Stacked outcome bars: ink = for, oxblood = against, gold = mixed, rule = procedural. */
export const OUTCOME_SERIES = {
  for_count: ink,
  against_count: oxblood,
  mixed_count: gold,
  procedural_count: ruleStrong,
} as const;

/** Up to three judges on one radar chart. */
export const JUDGE_SERIES: string[] = [ink, oxblood, gold];

/**
 * Shared recharts chrome — grid, axes, tick text, tooltip. Tick text is
 * `ink` (not ink-soft) for the same contrast reason as
 * `editorialPlotLayout`: chart labels render at ≤12 px.
 */
export const rechartsTheme = {
  grid: rule,
  axis: ruleStrong,
  tick: ink,
  tooltip: {
    backgroundColor: parchment,
    border: `1px solid ${rule}`,
    borderRadius: 0,
    fontSize: '12px',
    color: ink,
  },
} as const;

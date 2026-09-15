/** @jest-environment node */

/**
 * Semantic chart palette for the reasoning-line and judge charts (#640 §4).
 *
 * The chart components themselves (recharts, react-force-graph) cannot run
 * under jest, so the colour maps live in a pure module and are tested here.
 */

import { editorialPalette } from '@/lib/charts/editorial-plot';
import {
  DAG_EDGE_STYLE,
  DAG_NODE_STYLE,
  JUDGE_SERIES,
  OUTCOME_SERIES,
  rechartsTheme,
} from '@/lib/charts/reasoning-palette';

const PALETTE = new Set<string>(Object.values(editorialPalette));

describe('DAG_NODE_STYLE', () => {
  it('covers every DAGNodeStatus', () => {
    expect(Object.keys(DAG_NODE_STYLE).sort()).toEqual(['active', 'dormant', 'merged', 'superseded']);
  });

  it('uses only editorial palette colours', () => {
    for (const { fill, stroke } of Object.values(DAG_NODE_STYLE)) {
      expect(PALETTE).toContain(fill);
      expect(PALETTE).toContain(stroke);
    }
  });

  it('renders superseded lines hollow (paper fill, rule stroke)', () => {
    expect(DAG_NODE_STYLE.superseded.fill).toBe(editorialPalette.parchment);
    expect(DAG_NODE_STYLE.superseded.stroke).toBe(editorialPalette.ruleStrong);
  });
});

describe('DAG_EDGE_STYLE', () => {
  it('covers every DAGEdgeEventType', () => {
    expect(Object.keys(DAG_EDGE_STYLE).sort()).toEqual(['branch', 'drift', 'influence', 'merge']);
  });

  it('uses only editorial palette colours', () => {
    for (const { color } of Object.values(DAG_EDGE_STYLE)) {
      expect(PALETTE).toContain(color);
    }
  });

  it('gives every event type a distinct (colour, dash) pair', () => {
    const pairs = Object.values(DAG_EDGE_STYLE).map(({ color, dash }) => `${color}|${dash.join(',')}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('uses dash as a second channel — at least one dashed and one solid type', () => {
    const dashed = Object.values(DAG_EDGE_STYLE).filter(({ dash }) => dash.length > 0);
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed.length).toBeLessThan(Object.keys(DAG_EDGE_STYLE).length);
  });
});

describe('OUTCOME_SERIES', () => {
  it('covers the four outcome buckets with distinct palette colours', () => {
    expect(Object.keys(OUTCOME_SERIES).sort()).toEqual([
      'against_count',
      'for_count',
      'mixed_count',
      'procedural_count',
    ]);
    const colours = Object.values(OUTCOME_SERIES);
    expect(new Set(colours).size).toBe(colours.length);
    for (const colour of colours) expect(PALETTE).toContain(colour);
  });
});

describe('JUDGE_SERIES', () => {
  it('provides three distinct palette colours for judge comparison', () => {
    expect(JUDGE_SERIES).toHaveLength(3);
    expect(new Set(JUDGE_SERIES).size).toBe(3);
    for (const colour of JUDGE_SERIES) expect(PALETTE).toContain(colour);
  });
});

describe('rechartsTheme', () => {
  it('resolves to literal colours — recharts sets SVG attributes, where hsl(var(--x)) is invalid', () => {
    expect(JSON.stringify(rechartsTheme)).not.toMatch(/var\(--/);
    expect(PALETTE).toContain(rechartsTheme.grid);
    expect(PALETTE).toContain(rechartsTheme.tick);
    expect(PALETTE).toContain(rechartsTheme.tooltip.backgroundColor);
  });

  it('keeps the tooltip sharp-edged', () => {
    expect(rechartsTheme.tooltip.borderRadius).toBe(0);
  });
});

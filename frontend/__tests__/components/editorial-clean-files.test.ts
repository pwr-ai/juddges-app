/** @jest-environment node */

/**
 * Per-file hard gate for the Editorial migration (#639).
 *
 * `scripts/assert-no-banned-classes.js` ratchets the *total* count of
 * pre-Editorial tells downwards. This test is the stricter, file-level
 * complement: every file listed here has been migrated and must stay at zero.
 * Add a file once it is clean; never remove one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { countBannedPatterns } = require('../../scripts/assert-no-banned-classes');

const ROOT = join(__dirname, '../..');

const CLEAN_FILES = [
  'components/ui/accordion.tsx',
  'components/ui/button.tsx',
  'components/ui/card.tsx',
  'components/ui/command.tsx',
  'components/ui/logo.tsx',
  'components/ui/progress.tsx',
  'components/ui/sidebar.tsx',
  'lib/styles/components/ai-badge.tsx',
  'lib/styles/components/badge.tsx',
  'lib/styles/components/badges.ts',
  'lib/styles/components/base-card.tsx',
  'lib/styles/components/button-variants.ts',
  'lib/styles/components/empty-state.tsx',
  'lib/styles/components/error-card.tsx',
  'lib/styles/components/headers.ts',
  'lib/styles/components/juddges-logo.tsx',
  'lib/styles/components/light-card.tsx',
  'lib/styles/components/loading-indicator.tsx',
  'lib/styles/components/page-container.tsx',
  'components/judge-fingerprint/JudgeRadarChart.tsx',
  'components/reasoning-lines/DriftChart.tsx',
  'components/reasoning-lines/OutcomeTimeline.tsx',
  'components/reasoning-lines/ReasoningDAG.tsx',
  'lib/charts/reasoning-palette.ts',
  'app/about/page.tsx',
  'app/extractions/page.tsx',
  'app/extractions/[id]/_components/ExtractionJobClient.tsx',
  'app/extract/_components/ExtractionJobCard.tsx',
  'app/extract/_components/ExtractionConfigPanel.tsx',
  'app/extract/_components/RecentExtractions.tsx',
  'app/extract/_components/DocumentSelector.tsx',
  'app/extract/_components/types.ts',
];

/**
 * Recharts writes `stroke`/`fill` as SVG presentation attributes, where
 * `hsl(var(--border))` is invalid twice over: the tokens are already full
 * colours (see tests/unit/app/globals-css-tokens.test.ts), and `var()` does
 * not resolve in attributes. Charts must take literal hex from
 * `lib/charts/editorial-plot.ts`.
 */
const RECHARTS_FILES = [
  'components/judge-fingerprint/JudgeRadarChart.tsx',
  'components/reasoning-lines/DriftChart.tsx',
  'components/reasoning-lines/OutcomeTimeline.tsx',
];

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('migrated files stay free of banned classes', () => {
  it.each(CLEAN_FILES)('%s', (file) => {
    const counts = countBannedPatterns([{ path: file, content: read(file) }]);
    const hits = Object.fromEntries(Object.entries(counts).filter(([, n]) => n !== 0));
    expect(hits).toEqual({});
  });
});

describe('recharts components', () => {
  it.each(RECHARTS_FILES)('%s has no hsl(var(--…)) colours', (file) => {
    expect(read(file)).not.toMatch(/hsl\(\s*var\(--/);
  });
});

/** Canvas + recharts charts: every colour comes from `editorialPalette`, never a literal. */
const CHART_FILES = [...RECHARTS_FILES, 'components/reasoning-lines/ReasoningDAG.tsx'];

describe('chart components', () => {
  it.each(CHART_FILES)('%s has no colour literals (hex, rgb(), hsl())', (file) => {
    expect(read(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });
});

describe('app/about/page.tsx', () => {
  it('carries no marketing superlatives (#641 copy list)', () => {
    expect(read('app/about/page.tsx')).not.toMatch(
      /world-class|cutting-edge|innovative|state-of-the-art|revolutioniz|Empower|AI-powered/,
    );
  });
});

describe('components/ui/sidebar.tsx', () => {
  const source = read('components/ui/sidebar.tsx');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });

  it('has no empty variant-modifier tokens (`hover: `, `data-[active=true]: `)', () => {
    expect(source.match(/(?:hover|data-\[active=true\]):(?=\s|")/g) ?? []).toEqual([]);
  });
});

describe('lib/styles/components/base-card.tsx', () => {
  const source = read('lib/styles/components/base-card.tsx');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });
});

describe('lib/styles/components/button-variants.ts', () => {
  const source = read('lib/styles/components/button-variants.ts');

  it('uses colour tokens, not rgba()/hex literals', () => {
    expect(source).not.toMatch(/rgba\(|#[0-9a-fA-F]{6}\b/);
  });
});

describe('app/globals.css', () => {
  const css = read('app/globals.css');

  it('tints every shadow token with ink instead of pure black', () => {
    const shadowLines = css
      .split('\n')
      .filter((line) => /^\s*--shadow(-[a-z0-9]+)?:/.test(line));
    expect(shadowLines.length).toBeGreaterThanOrEqual(8);
    expect(shadowLines.filter((line) => /hsl\(0 0% 0%/.test(line))).toEqual([]);
  });

  it('caps elevation at --shadow-lg', () => {
    expect(css).toMatch(/--shadow-xl:\s*var\(--shadow-lg\)/);
    expect(css).toMatch(/--shadow-2xl:\s*var\(--shadow-lg\)/);
  });

  it('keeps rounded-xl inside the 0–2 px radius rule', () => {
    expect(css).toMatch(/--radius-xl:\s*var\(--radius\)/);
  });

  it('declares the editorial motion tokens', () => {
    expect(css).toMatch(/--default-transition-duration:\s*180ms/);
    expect(css).toMatch(/--ease-out-editorial:/);
  });

  it('no longer ships the glass page background or shimmer keyframes', () => {
    expect(css).not.toMatch(/glass-page-background/);
    expect(css).not.toMatch(/@keyframes (shimmer-slide|text-shimmer)/);
    expect(css).not.toMatch(/animate-(shimmer-slide|text-shimmer)/);
  });
});

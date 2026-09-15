/**
 * Coverage for the banned-class ratchet (#638).
 *
 * The gate counts pre-Editorial "AI slop" tells (glass blur, gradients,
 * Tailwind default hues, transition-all, big radii, scale hovers, decorative
 * AI glyphs) and fails when any count rises above the committed baseline, so
 * the migration in #637 cannot regress while it is in progress.
 */

// Plain CommonJS so `npm run validate` can run it with no build step.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require('../../scripts/assert-no-banned-classes');

const { countBannedPatterns, compareToBaseline, isAllowlisted, PATTERNS } = gate;

type Counts = Record<string, number>;

function zeroCounts(): Counts {
  return Object.fromEntries(Object.keys(PATTERNS).map((name) => [name, 0]));
}

describe('countBannedPatterns', () => {
  it('counts every tell family across files, one hit per occurrence', () => {
    const counts = countBannedPatterns([
      {
        path: 'components/x.tsx',
        content:
          '<div className="backdrop-blur-xl bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl transition-all hover:scale-[1.05] shadow-2xl" />',
      },
      {
        path: 'components/y.tsx',
        content: 'import { Sparkles } from "lucide-react";\nrepeat: Infinity\nbackdrop-blur-sm',
      },
    ]);

    expect(counts).toEqual({
      ...zeroCounts(),
      glass: 2,
      gradient: 1,
      hue: 2,
      'transition-all': 1,
      radius: 1,
      'hover-fx': 2,
      'ai-glyph': 1,
      motion: 1,
    });
  });

  it('does not count compliant Editorial classes', () => {
    const counts = countBannedPatterns([
      {
        path: 'components/z.tsx',
        content:
          '<div className="bg-parchment text-ink border-rule rounded-md rounded-lg transition-colors hover:-translate-y-px shadow-sm animate-pulse" />',
      },
    ]);

    expect(counts).toEqual(zeroCounts());
  });
});

describe('isAllowlisted', () => {
  it('skips the editorial primitives and the neutral skeleton', () => {
    expect(isAllowlisted('components/editorial/EditorialCard.tsx')).toBe(true);
    expect(isAllowlisted('components/ui/skeleton.tsx')).toBe(true);
    expect(isAllowlisted('components/ui/card.tsx')).toBe(false);
    expect(isAllowlisted('lib/styles/components/base-card.tsx')).toBe(false);
  });
});

describe('compareToBaseline', () => {
  it('flags a pattern whose count rose above the baseline', () => {
    const result = compareToBaseline({ ...zeroCounts(), glass: 5 }, { ...zeroCounts(), glass: 4 });

    expect(result.regressions).toEqual([{ name: 'glass', baseline: 4, actual: 5 }]);
    expect(result.improvements).toEqual([]);
  });

  it('reports a pattern whose count dropped so the baseline can be lowered', () => {
    const result = compareToBaseline({ ...zeroCounts(), hue: 2 }, { ...zeroCounts(), hue: 9 });

    expect(result.regressions).toEqual([]);
    expect(result.improvements).toEqual([{ name: 'hue', baseline: 9, actual: 2 }]);
  });

  it('treats a pattern missing from the baseline as zero', () => {
    const result = compareToBaseline({ ...zeroCounts(), motion: 1 }, {});

    expect(result.regressions).toEqual([{ name: 'motion', baseline: 0, actual: 1 }]);
  });
});

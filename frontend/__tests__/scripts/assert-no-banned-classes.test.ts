/**
 * Coverage for the banned-class ratchet (#638).
 *
 * The gate counts pre-Editorial "AI slop" tells (glass blur, gradients,
 * Tailwind default hues, transition-all, big radii, scale hovers, decorative
 * AI glyphs). It was a ratchet against a committed baseline while #637 was in
 * progress; since #642 every family is at zero and any hit is a hard failure.
 */

// Plain CommonJS so `npm run validate` can run it with no build step.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gate = require('../../scripts/assert-no-banned-classes');

const { countBannedPatterns, findOffenders, isAllowlisted, PATTERNS } = gate;

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

describe('pattern targeting: class usage, not token definitions', () => {
  // globals.css caps the oversized shadows by aliasing the tokens down:
  //   --shadow-xl: var(--shadow-lg);
  // That line is the countermeasure, not a violation. Counting it made the
  // gate score its own fix and put a literal zero out of reach (#642).
  it('ignores --shadow-xl / --shadow-2xl custom-property definitions', () => {
    const counts = countBannedPatterns([
      {
        path: 'app/globals.css',
        content: [
          '  --shadow-xl: var(--shadow-lg);',
          '  --shadow-2xl: var(--shadow-lg);',
          '  --shadow-xl: var(--shadow-xl);',
          '  --shadow-2xl: var(--shadow-2xl);',
        ].join('\n'),
      },
    ]);
    expect(counts['hover-fx']).toBe(0);
  });

  it('still counts shadow-xl and shadow-2xl used as utility classes', () => {
    const counts = countBannedPatterns([
      {
        path: 'components/x.tsx',
        content: '<div className="shadow-xl hover:shadow-2xl md:shadow-xl" />',
      },
    ]);
    expect(counts['hover-fx']).toBe(3);
  });

  it('still counts hover:scale-', () => {
    const counts = countBannedPatterns([
      { path: 'components/x.tsx', content: '<div className="hover:scale-105" />' },
    ]);
    expect(counts['hover-fx']).toBe(1);
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

describe('raw CSS, not just Tailwind class names (#713)', () => {
  // Every pattern was shaped like a utility class, so a rule written in plain
  // CSS walked straight past the gate. components.css hid a live
  // `backdrop-filter` blur on every toast and a dead purple gradient.
  it('counts backdrop-filter, not only the backdrop-blur utility', () => {
    const counts = countBannedPatterns([
      {
        path: 'lib/styles/x.css',
        content: [
          '  backdrop-filter: blur(20px) saturate(180%) !important;',
          '  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;',
        ].join('\n'),
      },
    ]);
    expect(counts.glass).toBe(2);
  });

  it('counts CSS gradient functions, not only bg-gradient-to-', () => {
    const counts = countBannedPatterns([
      {
        path: 'lib/styles/x.css',
        content: [
          '  background-image: linear-gradient(to bottom right, #a, #b);',
          '  background: radial-gradient(circle, #a, #b);',
          '  background: conic-gradient(#a, #b);',
        ].join('\n'),
      },
    ]);
    expect(counts.gradient).toBe(3);
  });

  it('counts a shimmer animation declared in CSS', () => {
    const counts = countBannedPatterns([
      {
        path: 'lib/styles/x.css',
        content: [
          '@keyframes ai-badge-shimmer {',
          '  animation: ai-badge-shimmer 3s ease-in-out infinite;',
        ].join('\n'),
      },
    ]);
    expect(counts.motion).toBe(2);
  });

  // `infinite` on its own is not the tell. A blinking text caret and a
  // skeleton pulse both loop forever and are both permitted (DESIGN.md
  // §4a, §6), so the pattern targets the sweep, not the repeat count.
  it('leaves the permitted perpetual animations alone', () => {
    const counts = countBannedPatterns([
      {
        path: 'app/globals.css',
        content: [
          '  animation: caret-blink 1.06s steps(1, end) infinite;',
          '  animation: fadeInSlide 500ms ease-out forwards, pulse 2s ease-in-out infinite;',
          '  // Prevent infinite loops when the chat is missing',
          '  /** Pagination metadata for progressive loading (infinite scroll) */',
        ].join('\n'),
      },
    ]);
    expect(counts.motion).toBe(0);
  });

  it('counts an arbitrary radius that ends a string literal', () => {
    // `rounded-(...)\b` never matched here: between `]` and `"` there are two
    // non-word characters, so there is no boundary to anchor against.
    const counts = countBannedPatterns([
      { path: 'components/x.tsx', content: 'className={cn("rounded-[24px]")}' },
    ]);
    expect(counts.radius).toBe(1);
  });

  it('still does not count a radius utility that merely starts the same way', () => {
    const counts = countBannedPatterns([
      { path: 'components/x.tsx', content: '<div className="rounded-xlarge rounded-none" />' },
    ]);
    expect(counts.radius).toBe(0);
  });
});

describe('findOffenders', () => {
  it('reports nothing for a clean set of files', () => {
    expect(
      findOffenders([{ path: 'components/x.tsx', content: '<div className="bg-parchment text-ink" />' }])
    ).toEqual([]);
  });

  it('names the family, the total count and the files it came from', () => {
    const offenders = findOffenders([
      { path: 'components/a.tsx', content: '<div className="backdrop-blur-sm" />' },
      { path: 'components/b.tsx', content: '<div className="backdrop-blur-md glass-panel" />' },
      { path: 'components/c.tsx', content: '<div className="bg-parchment" />' },
    ]);

    expect(offenders).toEqual([{ name: 'glass', count: 3, files: ['components/a.tsx', 'components/b.tsx'] }]);
  });
});

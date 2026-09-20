/**
 * Editorial contract for the shared button style helpers (#676).
 *
 * These two helpers are the only live exports of lib/styles/components/buttons.ts —
 * toggle-button and filter-toggle-group consume the pair. They used to emit gradients,
 * glass and hover-scale, which the ratchet counts against every surface rendering them.
 * The primary/secondary/icon helpers had no consumers at all and were deleted.
 */
import {
  getActiveButtonStyle,
  getInactiveButtonStyle,
} from '@/lib/styles/components/buttons';

const BANNED =
  /bg-gradient-to-|backdrop-blur|hover:scale-|shadow-(xl|2xl)|transition-all|rounded-(xl|2xl|3xl)|\b(bg|text|border|from|to|via|ring)-(slate|indigo|blue|gray)-\d/;

describe('getActiveButtonStyle', () => {
  it('renders the selected state in solid ink', () => {
    const cls = getActiveButtonStyle();
    expect(cls).toContain('bg-ink');
    expect(cls).toContain('text-parchment');
  });

  it('keeps the caller size and extra classes', () => {
    expect(getActiveButtonStyle('h-9', 'w-full')).toContain('h-9');
    expect(getActiveButtonStyle('h-9', 'w-full')).toContain('w-full');
  });

  it('emits no banned classes', () => {
    expect(getActiveButtonStyle()).not.toMatch(BANNED);
  });
});

describe('getInactiveButtonStyle', () => {
  it('renders the unselected state as a hairline outline', () => {
    const cls = getInactiveButtonStyle();
    expect(cls).toContain('border-rule');
    expect(cls).toContain('text-ink-soft');
  });

  it('emits no banned classes', () => {
    expect(getInactiveButtonStyle()).not.toMatch(BANNED);
  });
});

describe('dead style helpers', () => {
  it('no longer exports the unconsumed gradient helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/styles/components/buttons');
    expect(Object.keys(mod).sort()).toEqual(['getActiveButtonStyle', 'getInactiveButtonStyle']);
  });
});

/**
 * Editorial contract for the shared button style helpers (#676).
 *
 * `getActiveButtonStyle` and `getInactiveButtonStyle` are the only live exports of
 * lib/styles/components/buttons.ts — toggle-button and filter-toggle-group consume the
 * pair. #680 retoned them; this pins the result and guards the export surface, because
 * the three helpers that shipped alongside them (primary, secondary, icon) had no call
 * sites at all and were deleted rather than carried forward.
 */
import {
  getActiveButtonStyle,
  getInactiveButtonStyle,
} from '@/lib/styles/components/buttons';

const BANNED =
  /bg-gradient-to-|backdrop-blur|hover:scale-|shadow-(xl|2xl)\b|transition-all|rounded-(xl|2xl|3xl)\b|\b(bg|text|border|from|to|via|ring)-(slate|indigo|blue|gray|red|yellow)-\d/;

describe('getActiveButtonStyle', () => {
  it('renders the selected state as ink on a grey panel', () => {
    const cls = getActiveButtonStyle();
    expect(cls).toContain('bg-parchment-deep');
    expect(cls).toContain('text-ink');
    expect(cls).toContain('border-ink');
  });

  it('keeps the caller size and extra classes', () => {
    const cls = getActiveButtonStyle('h-9', 'w-full');
    expect(cls).toContain('h-9');
    expect(cls).toContain('w-full');
  });

  it('emits no banned classes', () => {
    expect(getActiveButtonStyle()).not.toMatch(BANNED);
  });
});

describe('getInactiveButtonStyle', () => {
  it('renders the unselected state as a hairline outline on parchment', () => {
    const cls = getInactiveButtonStyle();
    expect(cls).toContain('bg-parchment');
    expect(cls).toContain('text-ink-soft');
    expect(cls).toContain('border-rule');
  });

  it('uses no important modifiers to beat the ghost variant', () => {
    // Tailwind's important modifier attaches to the utility (`hover:!bg-x`), never the
    // variant. The pre-#680 code wrote `!hover:bg-gradient-to-br`, which compiled to
    // nothing; keeping the helper free of `!` entirely sidesteps the trap.
    expect(getInactiveButtonStyle()).not.toMatch(/!/);
  });

  it('emits no banned classes', () => {
    expect(getInactiveButtonStyle()).not.toMatch(BANNED);
  });
});

describe('dead style helpers', () => {
  it('no longer exports the unconsumed primary, secondary and icon helpers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/lib/styles/components/buttons');
    expect(Object.keys(mod).sort()).toEqual(['getActiveButtonStyle', 'getInactiveButtonStyle']);
  });
});

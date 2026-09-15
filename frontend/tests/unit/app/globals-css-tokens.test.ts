/** @jest-environment node */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every colour token in globals.css (`--muted`, `--primary`, …) already holds a
// complete colour, so wrapping one in `oklch(var(--x) / a)` nests
// `oklch(oklch(...))` — invalid CSS that the browser drops silently. Skeletons,
// flattened gradient buttons and scrollbars then render transparent (#622).
// Alpha on a token colour is `color-mix(in oklab, var(--x) N%, transparent)`.
describe('globals.css colour tokens', () => {
  const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

  it('never wraps a token in oklch()', () => {
    const offenders = css
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /oklch\(\s*var\(--/.test(line))
      .map(({ line, no }) => `${no}: ${line}`);
    expect(offenders).toEqual([]);
  });

  // The PWr layer (SIW 2025-12) is the source of truth; the editorial names
  // are aliases so the ~880 existing utilities keep working (#629).
  const PWR_TOKENS: Record<string, string> = {
    '--pwr-red': '#9A342D',
    '--pwr-red-deep': '#7E2A25',
    '--pwr-sand': '#F1D1A2',
    '--pwr-gold': '#B49A5E',
    '--pwr-black': '#000000',
    '--pwr-grey': '#5A5A5A',
    '--pwr-paper': '#FFFFFF',
    '--pwr-panel': '#EFEFEF',
    '--pwr-line': '#D9D9D9',
    '--pwr-line-strong': '#9A9A9A',
  };

  const ALIASES: Record<string, string> = {
    '--parchment': '--pwr-paper',
    '--parchment-deep': '--pwr-panel',
    '--ink': '--pwr-black',
    '--ink-soft': '--pwr-grey',
    '--rule': '--pwr-line',
    '--rule-strong': '--pwr-line-strong',
    '--oxblood': '--pwr-red',
    '--oxblood-deep': '--pwr-red-deep',
    '--gold': '--pwr-gold',
    '--gold-soft': '--pwr-sand',
  };

  const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));

  it.each(Object.entries(PWR_TOKENS))('defines %s as %s in :root', (token, hex) => {
    const re = new RegExp(`${token}:\\s*${hex}\\s*;`, 'i');
    expect(rootBlock).toMatch(re);
  });

  it.each(Object.entries(ALIASES))('aliases %s to %s', (alias, target) => {
    const re = new RegExp(`${alias}:\\s*var\\(${target}\\)\\s*;`);
    expect(rootBlock).toMatch(re);
  });

  it.each(Object.keys(PWR_TOKENS).map((t) => t.replace('--', '--color-')))(
    'exposes %s through @theme inline',
    (themeVar) => {
      expect(css).toMatch(new RegExp(`${themeVar}:\\s*var\\(${themeVar.replace('--color-', '--')}\\)\\s*;`));
    },
  );

  it('routes display type through Tenor Sans', () => {
    expect(rootBlock).toMatch(/--font-display:\s*var\(--font-tenor-sans\),\s*Optima,\s*"URW Classico",\s*"Gill Sans",\s*sans-serif;/);
    expect(rootBlock).toMatch(/--font-serif:\s*var\(--font-display\);/);
    expect(css).not.toMatch(/instrument-serif|Instrument Serif|Iowan Old Style/);
  });

  it('keeps display emphasis upright (Tenor Sans has no italic)', () => {
    const emRule = css.slice(css.indexOf('.editorial-display em'), css.indexOf('}', css.indexOf('.editorial-display em')));
    expect(emRule).toMatch(/font-style:\s*normal;/);
    expect(emRule).toMatch(/color:\s*var\(--pwr-red\);/);
  });
});

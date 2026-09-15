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
});

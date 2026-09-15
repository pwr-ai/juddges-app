/** @jest-environment node */

/**
 * PWr identity leftovers (#644): things the #629 restyle could not reach
 * through the token layer because they are literal values in TSX/TS.
 *
 * - Tenor Sans ships no italic, so `font-serif italic` synthesises an oblique
 *   the design spec forbids (docs/reference/DESIGN.md §1).
 * - Plotly, `next/og` and the PWA manifest need concrete hex, so the old
 *   Editorial Jurisprudence palette survived there as literals.
 * - `--destructive` sits on `--pwr-panel` under `text-destructive` in muted
 *   surfaces; it must clear WCAG AA for small text there.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css|js)$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = ['app', 'components', 'lib'].flatMap((d) => walk(join(ROOT, d)));

describe('faux italic on the display face', () => {
  it('no className combines font-serif with italic', () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES.filter((f) => f.endsWith('.tsx'))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // `italic` as a standalone utility (not `not-italic`, not `italic:`).
        if (/\bfont-serif\b/.test(line) && /(^|[\s"'`])italic([\s"'`]|$)/.test(line)) {
          offenders.push(`${relative(ROOT, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('parchment-era colour literals', () => {
  // Hex values of the pre-PWr Editorial Jurisprudence palette (any case).
  const OLD_HEX = /#(F5F1E8|EFE9D8|1A1A2E|5A5A75|C9C2B0|A89F88|8B1E3F|6F1230|B8954A|E8DCB8)\b/i;

  it('no source file carries an old-palette hex', () => {
    const offenders = SOURCE_FILES.filter((f) => OLD_HEX.test(readFileSync(f, 'utf8'))).map((f) =>
      relative(ROOT, f),
    );
    expect(offenders).toEqual([]);
  });
});

describe('app/globals.css destructive contrast', () => {
  const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

  function hexVar(name: string): string {
    const m = css.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6})`, 'm'));
    if (!m) throw new Error(`${name} is not a hex literal in globals.css`);
    return m[1];
  }

  function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it('--destructive clears AA (4.5:1) on --pwr-panel', () => {
    expect(contrast(hexVar('--destructive'), hexVar('--pwr-panel'))).toBeGreaterThanOrEqual(4.5);
  });

  it('--error matches --destructive', () => {
    expect(hexVar('--error')).toBe(hexVar('--destructive'));
  });
});

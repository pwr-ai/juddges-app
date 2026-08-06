/**
 * @jest-environment node
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_PATTERNS = [
  '/.next-contract-*/',
  '/tsconfig.contract-*.json',
  '/.next-production-build.lock/',
];

function isIgnored(path: string): boolean {
  const result = spawnSync(
    'git',
    ['-C', resolve('..'), 'check-ignore', '--quiet', path],
    { encoding: 'utf8' }
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `git check-ignore exited ${result.status}`);
  }
  return result.status === 0;
}

describe('production contract artifact ignores', () => {
  it('declares exact frontend-root patterns for every generated artifact', () => {
    const patterns = readFileSync(resolve('.gitignore'), 'utf8').split(/\r?\n/);

    for (const expected of EXPECTED_PATTERNS) {
      expect(patterns).toContain(expected);
    }
  });

  it('ignores generated root artifacts without hiding nested lookalikes', () => {
    expect(
      isIgnored('frontend/.next-contract-probe/build-manifest.json')
    ).toBe(true);
    expect(isIgnored('frontend/tsconfig.contract-probe.json')).toBe(true);
    expect(
      isIgnored('frontend/.next-production-build.lock/lease-probe')
    ).toBe(true);

    expect(
      isIgnored('frontend/nested/.next-contract-probe/build-manifest.json')
    ).toBe(false);
    expect(
      isIgnored('frontend/nested/tsconfig.contract-probe.json')
    ).toBe(false);
    expect(isIgnored('frontend/.next-contract/build-manifest.json')).toBe(false);
  });
});

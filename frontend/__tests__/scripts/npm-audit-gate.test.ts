/**
 * Coverage for the npm audit CI gate and its allowlist.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { blockingAdvisories, evaluate } = require('../../scripts/npm-audit-gate');

export {};

const report = {
  vulnerabilities: {
    picomatch: {
      via: [
        {
          source: 1247710,
          name: 'picomatch',
          title: 'ReDoS',
          url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
          severity: 'high',
        },
      ],
    },
    '@sentry/nextjs': { via: ['@rollup/plugin-commonjs'] },
    lodash: {
      via: [
        {
          source: 1,
          name: 'lodash',
          title: 'Moderate thing',
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
          severity: 'moderate',
        },
      ],
    },
  },
};

describe('blockingAdvisories', () => {
  it('returns only unique HIGH/CRITICAL advisories, keyed by GHSA id', () => {
    expect(blockingAdvisories(report)).toEqual([
      { id: 'GHSA-fc5q-39xc-vjpf', package: 'picomatch', severity: 'high', title: 'ReDoS' },
    ]);
  });
});

describe('evaluate', () => {
  const advisories = blockingAdvisories(report);
  const entry = { id: 'GHSA-fc5q-39xc-vjpf', reason: 'build-time only', expires: '2027-01-31' };

  it('blocks an advisory that is not allowlisted', () => {
    const result = evaluate(advisories, [], '2026-11-17');
    expect(result.blocking.map((a: { id: string }) => a.id)).toEqual(['GHSA-fc5q-39xc-vjpf']);
  });

  it('allows an allowlisted advisory through its expiry date', () => {
    const result = evaluate(advisories, [entry], '2027-01-31');
    expect(result.blocking).toEqual([]);
    expect(result.allowed).toHaveLength(1);
  });

  it('blocks again once the allowlist entry has expired', () => {
    const result = evaluate(advisories, [entry], '2027-02-01');
    expect(result.blocking).toEqual([expect.objectContaining({ expired: true })]);
  });

  it('blocks an entry without a reason', () => {
    const result = evaluate(advisories, [{ ...entry, reason: '' }], '2026-11-17');
    expect(result.blocking).toHaveLength(1);
  });

  it('reports allowlist entries that match no advisory as stale', () => {
    const result = evaluate([], [entry], '2026-11-17');
    expect(result.stale).toEqual(['GHSA-fc5q-39xc-vjpf']);
  });
});

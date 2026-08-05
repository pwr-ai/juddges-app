/**
 * Regression coverage for the dependency drift guard (#382).
 *
 * The scenario in the first test is the one that produced #360: the lockfile
 * pinned @tiptap/starter-kit 3.29.2 while node_modules held 2.27.2, so tsc
 * rejected StarterKit options that are valid in v3.
 */

// The guard is a plain CommonJS script so it can run via `node` with no build
// step; requiring it here keeps the test exercising exactly what npm runs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guard = require('../../scripts/check-deps-in-sync');

const { diffInstalledVersions, formatDriftReport } = guard;

type LockPackages = Record<string, { version?: string; optional?: boolean }>;

function lock(packages: LockPackages) {
  return { packages };
}

describe('diffInstalledVersions', () => {
  it('reports the #360 drift: installed major behind the lockfile', () => {
    const drift = diffInstalledVersions(
      lock({ 'node_modules/@tiptap/starter-kit': { version: '3.29.2' } }),
      lock({ 'node_modules/@tiptap/starter-kit': { version: '2.27.2' } })
    );

    expect(drift).toEqual([
      {
        name: '@tiptap/starter-kit',
        expected: '3.29.2',
        installed: '2.27.2',
      },
    ]);
  });

  it('returns no drift when the installed tree matches the lockfile', () => {
    const packages = {
      'node_modules/next': { version: '15.5.22' },
      'node_modules/@tiptap/starter-kit': { version: '3.29.2' },
    };

    expect(diffInstalledVersions(lock(packages), lock(packages))).toEqual([]);
  });

  it('ignores packages the lockfile lists but the platform did not install', () => {
    const drift = diffInstalledVersions(
      lock({
        'node_modules/next': { version: '15.5.22' },
        'node_modules/@img/sharp-darwin-arm64': { version: '0.34.4', optional: true },
      }),
      lock({ 'node_modules/next': { version: '15.5.22' } })
    );

    expect(drift).toEqual([]);
  });

  it('ignores extraneous packages that are installed but absent from the lockfile', () => {
    const drift = diffInstalledVersions(
      lock({ 'node_modules/next': { version: '15.5.22' } }),
      lock({
        'node_modules/next': { version: '15.5.22' },
        'node_modules/leftover-package': { version: '1.0.0' },
      })
    );

    expect(drift).toEqual([]);
  });

  it('compares nested (deduped) packages by their full path, not bare name', () => {
    const drift = diffInstalledVersions(
      lock({
        'node_modules/a/node_modules/semver': { version: '7.6.0' },
        'node_modules/semver': { version: '6.3.1' },
      }),
      lock({
        'node_modules/a/node_modules/semver': { version: '7.5.0' },
        'node_modules/semver': { version: '6.3.1' },
      })
    );

    expect(drift).toEqual([
      { name: 'a/node_modules/semver', expected: '7.6.0', installed: '7.5.0' },
    ]);
  });

  it('skips the lockfile root entry, which carries no resolvable version', () => {
    const drift = diffInstalledVersions(
      lock({ '': { version: '1.3.0' }, 'node_modules/next': { version: '15.5.22' } }),
      lock({ 'node_modules/next': { version: '15.5.22' } })
    );

    expect(drift).toEqual([]);
  });

  it('sorts drifted packages by name so the report is stable', () => {
    const drift = diffInstalledVersions(
      lock({
        'node_modules/zod': { version: '4.0.0' },
        'node_modules/next': { version: '15.5.22' },
      }),
      lock({
        'node_modules/zod': { version: '3.0.0' },
        'node_modules/next': { version: '15.0.0' },
      })
    );

    expect(drift.map((entry: { name: string }) => entry.name)).toEqual(['next', 'zod']);
  });
});

describe('formatDriftReport', () => {
  it('names each package with expected and installed versions', () => {
    const report = formatDriftReport([
      { name: '@tiptap/starter-kit', expected: '3.29.2', installed: '2.27.2' },
    ]);

    expect(report).toContain('@tiptap/starter-kit');
    expect(report).toContain('3.29.2');
    expect(report).toContain('2.27.2');
  });

  it('tells the reader how to fix the drift', () => {
    const report = formatDriftReport([
      { name: 'next', expected: '15.5.22', installed: '15.0.0' },
    ]);

    expect(report).toContain('npm ci');
  });

  it('truncates long reports but states the full count', () => {
    const drift = Array.from({ length: 30 }, (_, index) => ({
      name: `package-${String(index).padStart(2, '0')}`,
      expected: '2.0.0',
      installed: '1.0.0',
    }));

    const report = formatDriftReport(drift);

    expect(report).toContain('30');
    expect(report).not.toContain('package-29');
  });
});

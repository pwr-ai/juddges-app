#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/**
 * Fail fast when node_modules has drifted from package-lock.json.
 *
 * npm records what it actually installed in node_modules/.package-lock.json,
 * in the same shape as package-lock.json. Comparing the two catches a stale
 * install without walking the tree — the failure mode behind #360, where
 * @tiptap/starter-kit sat at 2.27.2 locally while the lockfile pinned 3.29.2
 * and CI (which uses `npm ci`) stayed green.
 */

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const LOCKFILE = path.join(FRONTEND_ROOT, 'package-lock.json');
const INSTALLED_LOCKFILE = path.join(FRONTEND_ROOT, 'node_modules', '.package-lock.json');

const MAX_REPORTED = 20;

/**
 * Strip npm's leading "node_modules/" so nested copies stay distinguishable:
 * "node_modules/a/node_modules/semver" becomes "a/node_modules/semver".
 */
function packageNameFromPath(lockPath) {
  return lockPath.replace(/^node_modules\//, '');
}

/**
 * Compare two lockfile-shaped objects and return the packages whose installed
 * version differs from the pinned one.
 *
 * Only packages present in both trees are compared. A package the lockfile
 * lists but that is not installed is almost always a platform-specific
 * optional dependency, and a package installed but absent from the lockfile is
 * extraneous — neither means the install is out of date.
 */
function diffInstalledVersions(lockfile, installed) {
  const lockPackages = (lockfile && lockfile.packages) || {};
  const installedPackages = (installed && installed.packages) || {};
  const drift = [];

  for (const [lockPath, lockEntry] of Object.entries(lockPackages)) {
    // The root entry ("") describes the workspace itself, not a dependency.
    if (!lockPath || !lockEntry || !lockEntry.version) continue;

    const installedEntry = installedPackages[lockPath];
    if (!installedEntry || !installedEntry.version) continue;

    if (installedEntry.version !== lockEntry.version) {
      drift.push({
        name: packageNameFromPath(lockPath),
        expected: lockEntry.version,
        installed: installedEntry.version,
      });
    }
  }

  return drift.sort((a, b) => a.name.localeCompare(b.name));
}

function formatDriftReport(drift) {
  const lines = [
    `${drift.length} package(s) in node_modules do not match package-lock.json:`,
    '',
  ];

  for (const { name, expected, installed } of drift.slice(0, MAX_REPORTED)) {
    lines.push(`  ${name}: lockfile pins ${expected}, installed ${installed}`);
  }

  if (drift.length > MAX_REPORTED) {
    lines.push(`  ... and ${drift.length - MAX_REPORTED} more`);
  }

  lines.push('', 'Run `npm ci` in frontend/ to reinstall from the lockfile.');

  return lines.join('\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  if (!fs.existsSync(INSTALLED_LOCKFILE)) {
    console.error(
      'Dependencies are not installed (node_modules/.package-lock.json is missing).\n' +
        'Run `npm ci` in frontend/ first.'
    );
    return 1;
  }

  const drift = diffInstalledVersions(readJson(LOCKFILE), readJson(INSTALLED_LOCKFILE));

  if (drift.length > 0) {
    console.error(formatDriftReport(drift));
    return 1;
  }

  return 0;
}

module.exports = { diffInstalledVersions, formatDriftReport, packageNameFromPath };

if (require.main === module) {
  process.exit(main());
}

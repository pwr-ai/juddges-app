/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RETIRED_DEVELOPER_ROUTES = [
  '/api/component-source',
  '/api/extractions/debug',
  '/api/mock/jobs',
  '/api/mock/schemas',
  '/api/mock/extractions',
];

function flattenRewrites(rewrites = {}) {
  if (Array.isArray(rewrites)) {
    return rewrites;
  }

  return [
    ...(rewrites.beforeFiles ?? []),
    ...(rewrites.afterFiles ?? []),
    ...(rewrites.fallback ?? []),
  ];
}

function manifestEntryMatches(entry, pathname) {
  if (entry.page === pathname || entry.source === pathname) {
    return true;
  }

  if (!entry.regex) {
    return false;
  }

  return new RegExp(entry.regex).test(pathname);
}

function assertRetiredRoutesAbsent(appPathsManifest, routesManifest) {
  const routeEntries = [
    ...(routesManifest.dynamicRoutes ?? []),
    ...(routesManifest.staticRoutes ?? []),
  ];
  const rewrites = flattenRewrites(routesManifest.rewrites);
  const violations = [];

  for (const pathname of RETIRED_DEVELOPER_ROUTES) {
    const appRoute = `${pathname}/route`;

    if (Object.hasOwn(appPathsManifest, appRoute)) {
      violations.push(`${pathname} is present in app-paths-manifest.json`);
    }

    for (const entry of routeEntries) {
      if (manifestEntryMatches(entry, pathname)) {
        violations.push(`${entry.page ?? entry.regex} matches ${pathname}`);
      }
    }

    for (const rewrite of rewrites) {
      if (manifestEntryMatches(rewrite, pathname)) {
        violations.push(`rewrite ${rewrite.source ?? rewrite.regex} matches ${pathname}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Retired developer API route detected:\n${violations
        .map((violation) => `- ${violation}`)
        .join('\n')}`
    );
  }
}

function readJson(pathname) {
  return JSON.parse(readFileSync(pathname, 'utf8'));
}

function assertBuiltManifests() {
  const buildDirectory = join(process.cwd(), '.next');
  const appPathsManifest = readJson(
    join(buildDirectory, 'server', 'app-paths-manifest.json')
  );
  const routesManifest = readJson(join(buildDirectory, 'routes-manifest.json'));

  assertRetiredRoutesAbsent(appPathsManifest, routesManifest);
  process.stdout.write(
    'Retired developer API routes are absent from production manifests.\n'
  );
}

if (require.main === module) {
  assertBuiltManifests();
}

module.exports = {
  RETIRED_DEVELOPER_ROUTES,
  assertBuiltManifests,
  assertRetiredRoutesAbsent,
};

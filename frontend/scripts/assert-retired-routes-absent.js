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

function flattenRewrites(rewrites) {
  return [
    ...rewrites.beforeFiles,
    ...rewrites.afterFiles,
    ...rewrites.fallback,
  ];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasStringProperties(entry, properties) {
  return (
    isRecord(entry) &&
    properties.every((property) => typeof entry[property] === 'string')
  );
}

function assertSupportedManifestSchema(appPathsManifest, routesManifest) {
  const appPathsAreSupported =
    isRecord(appPathsManifest) &&
    Object.entries(appPathsManifest).every(
      ([appPathKey, outputPath]) =>
        appPathKey.startsWith('/') && typeof outputPath === 'string'
    );
  const rewrites = routesManifest?.rewrites;
  const rewriteCollectionsAreSupported =
    isRecord(rewrites) &&
    Array.isArray(rewrites.beforeFiles) &&
    Array.isArray(rewrites.afterFiles) &&
    Array.isArray(rewrites.fallback);
  const routeCollectionsAreSupported =
    routesManifest?.version === 3 &&
    Array.isArray(routesManifest.redirects) &&
    Array.isArray(routesManifest.dynamicRoutes) &&
    Array.isArray(routesManifest.staticRoutes);

  if (
    !appPathsAreSupported ||
    !rewriteCollectionsAreSupported ||
    !routeCollectionsAreSupported
  ) {
    throw new Error(
      'Unsupported or incomplete Next.js routes manifest: expected version 3 with complete route, redirect, and rewrite collections.'
    );
  }

  const routeEntriesAreSupported = [
    ...routesManifest.dynamicRoutes,
    ...routesManifest.staticRoutes,
  ].every((entry) => hasStringProperties(entry, ['page', 'regex']));
  const redirectsAreSupported = routesManifest.redirects.every((entry) =>
    hasStringProperties(entry, ['source', 'destination', 'regex'])
  );
  const rewritesAreSupported = flattenRewrites(rewrites).every((entry) =>
    hasStringProperties(entry, ['source', 'destination', 'regex'])
  );

  if (
    !routeEntriesAreSupported ||
    !redirectsAreSupported ||
    !rewritesAreSupported
  ) {
    throw new Error(
      'Unsupported or incomplete Next.js routes manifest: route entries do not match the supported version 3 schema.'
    );
  }
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

function normalizeAppPathKey(appPathKey) {
  const segments = appPathKey.split('/').filter(Boolean);

  if (segments.at(-1) === 'route') {
    segments.pop();
  }

  const publicSegments = segments.filter(
    (segment) =>
      !(segment.startsWith('(') && segment.endsWith(')')) &&
      !segment.startsWith('@')
  );

  return `/${publicSegments.join('/')}`;
}

function assertRetiredRoutesAbsent(appPathsManifest, routesManifest) {
  assertSupportedManifestSchema(appPathsManifest, routesManifest);

  const routeEntries = [
    ...(routesManifest.dynamicRoutes ?? []),
    ...(routesManifest.staticRoutes ?? []),
  ];
  const redirects = routesManifest.redirects;
  const rewrites = flattenRewrites(routesManifest.rewrites);
  const appRoutes = Object.keys(appPathsManifest)
    .filter((appPathKey) => appPathKey.endsWith('/route'))
    .map((appPathKey) => ({
      appPathKey,
      pathname: normalizeAppPathKey(appPathKey),
    }));
  const violations = [];

  for (const pathname of RETIRED_DEVELOPER_ROUTES) {
    for (const appRoute of appRoutes) {
      if (appRoute.pathname === pathname) {
        violations.push(
          `${appRoute.appPathKey} exposes ${pathname} in app-paths-manifest.json`
        );
      }
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

    for (const redirect of redirects) {
      if (manifestEntryMatches(redirect, pathname)) {
        violations.push(
          `redirect ${redirect.source ?? redirect.regex} matches ${pathname}`
        );
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
  assertSupportedManifestSchema,
  normalizeAppPathKey,
};

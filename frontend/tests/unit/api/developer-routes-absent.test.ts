/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-require-imports */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const {
  RETIRED_DEVELOPER_ROUTES,
  assertRetiredRoutesAbsent,
} = require('../../../scripts/assert-retired-routes-absent');

const componentSourceRoute = RETIRED_DEVELOPER_ROUTES.find(
  (pathname: string) => pathname.endsWith('/component-source')
);
if (!componentSourceRoute) {
  throw new Error('The retired component-source route is missing from the guard');
}
const retiredDeveloperRouteDirectories: string[] = RETIRED_DEVELOPER_ROUTES.map(
  (pathname: string) => join('app', pathname.replace(/^\//, ''))
);
const routeExtensions = ['js', 'jsx', 'ts', 'tsx'];

function validRoutesManifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    redirects: [],
    dynamicRoutes: [],
    staticRoutes: [],
    rewrites: {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    },
    ...overrides,
  };
}

describe('retired developer API routes', () => {
  it.each(retiredDeveloperRouteDirectories)(
    'does not ship a handler with any supported extension in %s',
    (relativeDirectory) => {
      for (const extension of routeExtensions) {
        expect(
          existsSync(join(process.cwd(), relativeDirectory, `route.${extension}`))
        ).toBe(false);
      }
    }
  );

  it('accepts a supported production manifest without retired routes', () => {
    expect(() =>
      assertRetiredRoutesAbsent(
        { '/api/documents/route': 'app/api/documents/route.js' },
        validRoutesManifest()
      )
    ).not.toThrow();
  });

  it.each([
    {
      label: 'a JavaScript route compiled from any source extension or symlink',
      appPaths: {
        [`${componentSourceRoute}/route`]: 'app/api/component-source/route.js',
      },
      routes: validRoutesManifest(),
    },
    {
      label: 'a route hidden behind a root route group',
      appPaths: {
        [`/(internal)${componentSourceRoute}/route`]:
          'app/(internal)/api/component-source/route.js',
      },
      routes: validRoutesManifest(),
    },
    {
      label: 'a route hidden behind a nested route group',
      appPaths: {
        [`${componentSourceRoute.replace('/api/', '/api/(internal)/')}/route`]:
          'app/api/(internal)/component-source/route.js',
      },
      routes: validRoutesManifest(),
    },
    {
      label: 'a route hidden behind a parallel slot',
      appPaths: {
        [`${componentSourceRoute.replace('/api/', '/api/@slot/')}/route`]:
          'app/api/@slot/component-source/route.js',
      },
      routes: validRoutesManifest(),
    },
    {
      label: 'a catch-all route',
      appPaths: {
        '/api/[[...path]]/route': 'app/api/[[...path]]/route.js',
      },
      routes: validRoutesManifest({
        dynamicRoutes: [
          { page: '/api/[[...path]]', regex: '^/api(?:/(.*))?/?$' },
        ],
      }),
    },
    {
      label: 'a rewrite',
      appPaths: {},
      routes: validRoutesManifest({
        rewrites: {
          beforeFiles: [
            {
              source: componentSourceRoute,
              destination: '/api/documents',
              regex: `^${componentSourceRoute}(?:/)?$`,
            },
          ],
          afterFiles: [],
          fallback: [],
        },
      }),
    },
    {
      label: 'a redirect',
      appPaths: {},
      routes: validRoutesManifest({
        redirects: [
          {
            source: componentSourceRoute,
            destination: '/api/documents',
            regex: `^${componentSourceRoute}(?:/)?$`,
          },
        ],
      }),
    },
  ])('rejects $label', ({ appPaths, routes }) => {
    expect(() => assertRetiredRoutesAbsent(appPaths, routes)).toThrow(
      /retired developer API route/i
    );
  });

  it.each([
    ['an unknown manifest version', validRoutesManifest({ version: 99 })],
    [
      'a missing redirects collection',
      (() => {
        const { redirects: _redirects, ...incomplete } = validRoutesManifest();
        return incomplete;
      })(),
    ],
    [
      'an incomplete rewrites schema',
      validRoutesManifest({ rewrites: { beforeFiles: [] } }),
    ],
  ])('fails closed for %s', (_label, routes) => {
    expect(() => assertRetiredRoutesAbsent({}, routes)).toThrow(
      /unsupported or incomplete next\.js routes manifest/i
    );
  });

  it('treats traversal and symlink query variants as the same retired route', () => {
    const appPaths = {
      [`${componentSourceRoute}/route`]: 'app/api/component-source/route.js',
    };
    const routes = validRoutesManifest();
    const requests = [
      `${componentSourceRoute}?path=lib/styles/components/../../../../.env`,
      `${componentSourceRoute}?path=lib/styles/components/%2e%2e/%2e%2e/.env`,
      `${componentSourceRoute}?path=lib/styles/components/source-link`,
    ];

    for (const request of requests) {
      expect(new URL(request, 'http://localhost').pathname).toBe(
        componentSourceRoute
      );
      expect(() => assertRetiredRoutesAbsent(appPaths, routes)).toThrow();
    }
  });
});

/**
 * @jest-environment node
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertRetiredRoutesAbsent } = require('../../../scripts/assert-retired-routes-absent');

const retiredDeveloperRouteDirectories = [
  'app/api/component-source',
  'app/api/extractions/debug',
  'app/api/mock/jobs',
  'app/api/mock/schemas',
  'app/api/mock/extractions',
];

const routeExtensions = ['js', 'jsx', 'ts', 'tsx'];

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

  it('accepts a production manifest without retired routes', () => {
    expect(() =>
      assertRetiredRoutesAbsent(
        { '/api/documents/route': 'app/api/documents/route.js' },
        { dynamicRoutes: [], staticRoutes: [], rewrites: {} }
      )
    ).not.toThrow();
  });

  it.each([
    {
      label: 'a JavaScript route compiled from any source extension or symlink',
      appPaths: {
        '/api/component-source/route': 'app/api/component-source/route.js',
      },
      routes: { dynamicRoutes: [], staticRoutes: [], rewrites: {} },
    },
    {
      label: 'a route hidden behind a root route group',
      appPaths: {
        '/(internal)/api/component-source/route':
          'app/(internal)/api/component-source/route.js',
      },
      routes: { dynamicRoutes: [], staticRoutes: [], rewrites: {} },
    },
    {
      label: 'a route hidden behind a nested route group',
      appPaths: {
        '/api/(internal)/component-source/route':
          'app/api/(internal)/component-source/route.js',
      },
      routes: { dynamicRoutes: [], staticRoutes: [], rewrites: {} },
    },
    {
      label: 'a route hidden behind a parallel slot',
      appPaths: {
        '/api/@slot/component-source/route':
          'app/api/@slot/component-source/route.js',
      },
      routes: { dynamicRoutes: [], staticRoutes: [], rewrites: {} },
    },
    {
      label: 'a catch-all route',
      appPaths: {
        '/api/[[...path]]/route': 'app/api/[[...path]]/route.js',
      },
      routes: {
        dynamicRoutes: [
          { page: '/api/[[...path]]', regex: '^/api(?:/(.*))?/?$' },
        ],
        staticRoutes: [],
        rewrites: {},
      },
    },
    {
      label: 'a rewrite',
      appPaths: {},
      routes: {
        dynamicRoutes: [],
        staticRoutes: [],
        rewrites: {
          beforeFiles: [
            {
              source: '/api/component-source',
              destination: '/api/documents',
              regex: '^/api/component-source(?:/)?$',
            },
          ],
        },
      },
    },
  ])('rejects $label', ({ appPaths, routes }) => {
    expect(() => assertRetiredRoutesAbsent(appPaths, routes)).toThrow(
      /retired developer API route/i
    );
  });

  it('treats traversal and symlink query variants as the same retired route', () => {
    const appPaths = {
      '/api/component-source/route': 'app/api/component-source/route.js',
    };
    const routes = { dynamicRoutes: [], staticRoutes: [], rewrites: {} };
    const requests = [
      '/api/component-source?path=lib/styles/components/../../../../.env',
      '/api/component-source?path=lib/styles/components/%2e%2e/%2e%2e/.env',
      '/api/component-source?path=lib/styles/components/source-link',
    ];

    for (const request of requests) {
      expect(new URL(request, 'http://localhost').pathname).toBe(
        '/api/component-source'
      );
      expect(() => assertRetiredRoutesAbsent(appPaths, routes)).toThrow();
    }
  });
});

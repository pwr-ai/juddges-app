/**
 * @jest-environment node
 */

import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const retiredDeveloperRoutes = [
  'app/api/component-source/route.ts',
  'app/api/extractions/debug/route.ts',
  'app/api/mock/jobs/route.ts',
  'app/api/mock/schemas/route.ts',
  'app/api/mock/extractions/route.ts',
];

const componentSourceTraversalRequests = [
  '/api/component-source?path=lib/styles/components/../../../../.env',
  '/api/component-source?path=lib/styles/components/%2e%2e/%2e%2e/%2e%2e/.env',
  '/api/component-source?path=lib/styles/components/source-link',
];

function routeFileForRequest(requestPath: string): string {
  const pathname = new URL(requestPath, 'http://localhost').pathname;
  return join(process.cwd(), 'app', pathname, 'route.ts');
}

describe('retired developer API routes', () => {
  it.each(retiredDeveloperRoutes)('does not ship %s', (relativePath) => {
    const routePath = join(process.cwd(), relativePath);

    expect(existsSync(routePath)).toBe(false);
  });

  it.each(componentSourceTraversalRequests)(
    'cannot read files through an absent endpoint: %s',
    (requestPath) => {
      const routePath = routeFileForRequest(requestPath);

      expect(existsSync(routePath)).toBe(false);
    }
  );

  it('does not replace the retired component-source handler with a symlink', () => {
    const routePath = join(
      process.cwd(),
      'app/api/component-source/route.ts'
    );

    expect(existsSync(routePath)).toBe(false);
    expect(() => lstatSync(routePath)).toThrow();
  });
});

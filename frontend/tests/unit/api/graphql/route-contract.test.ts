/**
 * @jest-environment node
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

import {
  acquireProductionBuildLock,
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
} from '@/tests/support/production-build-lock';
import {
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
  PRODUCTION_READINESS_POLL_INTERVAL_MS,
  PRODUCTION_READINESS_REQUEST_TIMEOUT_MS,
  PRODUCTION_REQUEST_TIMEOUT_MS,
  PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
  runProductionChild,
  spawnProductionChild,
  stopProductionChild,
} from '@/tests/support/production-child-process';

jest.setTimeout(PRODUCTION_BUILD_TEST_TIMEOUT_MS);

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to reserve a production server port');
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function requestUntilReady(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
        redirect: 'manual',
        signal: AbortSignal.timeout(PRODUCTION_READINESS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, PRODUCTION_READINESS_POLL_INTERVAL_MS)
      );
    }
  }
  throw lastError;
}

describe('GraphQL browser surface contract', () => {
  it('does not ship retired browser GraphQL artifacts', () => {
    expect(existsSync(join(process.cwd(), 'lib/graphql-client.ts'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'types/graphql.ts'))).toBe(false);
  });

  it('returns 404 for the retired route in a real production build', async () => {
    const releaseProductionBuildLock = await acquireProductionBuildLock();
    try {
      const nextBin = join(process.cwd(), 'node_modules/next/dist/bin/next');
      await runProductionChild({
        command: process.execPath,
        args: [nextBin, 'build'],
        label: 'Next production build',
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production' },
        timeoutMs: PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
      });

      const manifestPath = join(
        process.cwd(),
        '.next/server/app-paths-manifest.json'
      );
      const manifest = JSON.parse(
        readFileSync(manifestPath, 'utf8')
      ) as Record<string, string>;
      expect(Object.keys(manifest)).not.toContain('/api/graphql/route');

      const port = await reservePort();
      const serverPath = join(
        process.cwd(),
        '.next/standalone/frontend/server.js'
      );
      const productionServer = spawnProductionChild({
        command: process.execPath,
        args: [serverPath],
        label: 'Next standalone production server',
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        },
        timeoutMs: PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
      });

      try {
        const retiredRoute = await requestUntilReady(
          `http://127.0.0.1:${port}/api/graphql`
        );
        const lookalikeRoute = await fetch(
          `http://127.0.0.1:${port}/api/graphql/nested`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            redirect: 'manual',
            signal: AbortSignal.timeout(PRODUCTION_REQUEST_TIMEOUT_MS),
          }
        );

        expect(retiredRoute.status).toBe(404);
        expect(lookalikeRoute.status).toBe(307);
        expect(lookalikeRoute.headers.get('location')).toBe(
          `http://localhost:${port}/auth/login?next=%2Fapi%2Fgraphql%2Fnested`
        );
        await Promise.all([retiredRoute.text(), lookalikeRoute.text()]);
      } catch (error) {
        throw new Error(
          `Production route check failed: ${String(error)}\n${productionServer.output()}`
        );
      } finally {
        await stopProductionChild(productionServer);
      }
    } finally {
      await releaseProductionBuildLock();
    }
  });
});

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
  cleanupProductionContractBuild,
  prepareProductionContractBuild,
  type ProductionContractBuild,
} from '@/tests/support/production-contract-build';
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

const GRAPHQL_CONTRACT_FILE = 'tests/unit/api/graphql/route-contract.test.ts';

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
    let contractBuild: ProductionContractBuild | undefined;
    try {
      contractBuild = await prepareProductionContractBuild(
        GRAPHQL_CONTRACT_FILE
      );
      const productionEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        ...contractBuild.environment,
        NODE_ENV: 'production',
      };
      const nextBin = join(process.cwd(), 'node_modules/next/dist/bin/next');
      await runProductionChild({
        command: process.execPath,
        args: [nextBin, 'build'],
        label: 'Next production build',
        cwd: process.cwd(),
        env: productionEnvironment,
        timeoutMs: PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
      });

      const manifestPath = join(
        contractBuild.buildPath,
        'server/app-paths-manifest.json'
      );
      const manifest = JSON.parse(
        readFileSync(manifestPath, 'utf8')
      ) as Record<string, string>;
      expect(Object.keys(manifest)).not.toContain('/api/graphql/route');

      const port = await reservePort();
      const serverPath = join(
        contractBuild.buildPath,
        'standalone/frontend/server.js'
      );
      const productionServer = spawnProductionChild({
        command: process.execPath,
        args: [serverPath],
        label: 'Next standalone production server',
        cwd: process.cwd(),
        env: {
          ...productionEnvironment,
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
        // Resolved against the server origin because Next 16 emits a relative
        // Location where 15 emitted an absolute one. Both are valid per RFC
        // 7231; the contract is the target, not the serialisation.
        const loginRedirect = new URL(
          lookalikeRoute.headers.get('location') as string,
          `http://localhost:${port}`
        );
        expect(loginRedirect.pathname + loginRedirect.search).toBe(
          '/auth/login?next=%2Fapi%2Fgraphql%2Fnested'
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
      try {
        await cleanupProductionContractBuild(contractBuild);
      } finally {
        await releaseProductionBuildLock();
      }
    }
  });
});

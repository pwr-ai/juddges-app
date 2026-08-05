/**
 * @jest-environment node
 */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

jest.setTimeout(180_000);

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
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    const nextBin = join(process.cwd(), 'node_modules/next/dist/bin/next');
    const build = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      timeout: 150_000,
    });

    if (build.status !== 0) {
      throw new Error(`Production build failed:\n${build.stdout}\n${build.stderr}`);
    }

    const manifestPath = join(process.cwd(), '.next/server/app-paths-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    expect(Object.keys(manifest)).not.toContain('/api/graphql/route');

    const port = await reservePort();
    const serverPath = join(process.cwd(), '.next/standalone/frontend/server.js');
    const productionServer = spawn(process.execPath, [serverPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    productionServer.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    productionServer.stderr?.on('data', (chunk) => {
      output += chunk.toString();
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
        }
      );

      expect(retiredRoute.status).toBe(404);
      expect(lookalikeRoute.status).toBe(307);
      expect(lookalikeRoute.headers.get('location')).toBe(
        `http://localhost:${port}/auth/login?next=%2Fapi%2Fgraphql%2Fnested`
      );
      await Promise.all([retiredRoute.text(), lookalikeRoute.text()]);
    } catch (error) {
      throw new Error(`Production route check failed: ${String(error)}\n${output}`);
    } finally {
      if (productionServer.exitCode === null) {
        const exited = once(productionServer, 'exit');
        productionServer.kill('SIGTERM');
        await Promise.race([
          exited,
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
        if (productionServer.exitCode === null) {
          productionServer.kill('SIGKILL');
        }
      }
    }
  });
});

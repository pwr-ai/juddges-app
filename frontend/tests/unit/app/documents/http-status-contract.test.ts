/**
 * @jest-environment node
 */

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';

jest.setTimeout(180_000);

async function reservePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function requestUntilReady(url: string, cookie: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

function authenticatedCookie(): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'owner-1',
    aud: 'authenticated',
    exp: expiresAt,
  })}.test-signature`;
  const session = {
    access_token: accessToken,
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: { id: 'owner-1', email: 'owner@example.test' },
  };
  return `sb-127-auth-token=base64-${encode(session)}`;
}

describe('documents page production HTTP status contract', () => {
  it('returns an actual HTTP 404 when authenticated metadata lookup returns 404', async () => {
    const upstreamPort = await reservePort();
    const appPort = await reservePort();
    const upstreamRequests: string[] = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push(`${request.method} ${request.url}`);
      if (request.url === '/auth/v1/user') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ id: 'owner-1', email: 'owner@example.test' }));
        return;
      }
      if (request.url === '/documents/missing-doc/metadata') {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ detail: 'Document not found' }));
        return;
      }
      response.writeHead(404).end();
    });

    const commonEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      BACKEND_API_KEY: 'test-backend-key',
    };
    const nextBin = join(process.cwd(), 'node_modules/next/dist/bin/next');
    const build = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: process.cwd(),
      env: commonEnv,
      encoding: 'utf8',
      timeout: 150_000,
    });
    if (build.status !== 0) {
      throw new Error(`Production build failed:\n${build.stdout}\n${build.stderr}`);
    }

    await listen(upstream, upstreamPort);
    const serverPath = join(process.cwd(), '.next/standalone/frontend/server.js');
    const productionServer = spawn(process.execPath, [serverPath], {
      cwd: process.cwd(),
      env: {
        ...commonEnv,
        PORT: String(appPort),
        HOSTNAME: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    productionServer.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    productionServer.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

    try {
      const result = await requestUntilReady(
        `http://127.0.0.1:${appPort}/documents/missing-doc`,
        authenticatedCookie()
      );
      const body = await result.text();
      if (result.status !== 404) {
        throw new Error(JSON.stringify({
          status: result.status,
          body: body.slice(0, 500),
          upstreamRequests,
        }));
      }
      expect(body).toMatch(/not found|404/i);
    } catch (error) {
      throw new Error(`Production status check failed: ${String(error)}\n${output}`);
    } finally {
      if (productionServer.exitCode === null) {
        const exited = once(productionServer, 'exit');
        productionServer.kill('SIGTERM');
        let exitTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          exited,
          new Promise((resolve) => {
            exitTimer = setTimeout(resolve, 5_000);
            exitTimer.unref();
          }),
        ]);
        if (exitTimer) clearTimeout(exitTimer);
        if (productionServer.exitCode === null) productionServer.kill('SIGKILL');
      }
      upstream.closeAllConnections();
      await close(upstream);
    }
  });
});

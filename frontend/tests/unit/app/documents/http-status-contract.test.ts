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

async function requestUntilReady(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url, { redirect: 'manual', ...options });
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
  return `sb-127-auth-token=base64-${encode({
    access_token: accessToken,
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: { id: 'owner-1', email: 'owner@example.test' },
  })}`;
}

describe('documents production HTTP/auth status matrix', () => {
  it('keeps not-found, failures, methods, auth, and single-fetch semantics exact', async () => {
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

      const documentId = request.url?.match(/^\/documents\/([^/]+)\/metadata$/)?.[1];
      if (!documentId) {
        response.writeHead(404).end();
        return;
      }
      if (documentId === 'missing-doc') {
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ detail: 'missing' }));
        return;
      }
      if (documentId === 'other-users-doc') {
        response.writeHead(403, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ detail: 'secret' }));
        return;
      }
      if (documentId === 'server-error-doc') {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ detail: 'failed' }));
        return;
      }
      if (documentId === 'unavailable-doc') {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ detail: 'unavailable' }));
        return;
      }
      if (documentId === 'malformed-doc') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ unexpected: true }));
        return;
      }
      if (documentId === 'timeout-doc') {
        // Deliberately leave the real socket pending until AbortSignal.timeout.
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        document_id: documentId,
        document_type: 'judgment',
        language: 'en',
        title: 'Visible judgment',
      }));
    });

    const commonEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      BACKEND_API_KEY: 'test-backend-key',
      DOCUMENT_METADATA_TIMEOUT_MS: '50',
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
      env: { ...commonEnv, PORT: String(appPort), HOSTNAME: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    productionServer.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    productionServer.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const appUrl = `http://127.0.0.1:${appPort}`;
    const authenticated = { Cookie: authenticatedCookie() };

    try {
      const expectedStatuses: Record<string, number> = {
        'missing-doc': 404,
        'other-users-doc': 404,
        'server-error-doc': 500,
        'unavailable-doc': 503,
        'malformed-doc': 502,
        'timeout-doc': 504,
      };
      for (const [id, status] of Object.entries(expectedStatuses)) {
        const result = await requestUntilReady(`${appUrl}/documents/${id}`, {
          headers: authenticated,
        });
        expect(result.status).toBe(status);
        if (status >= 500) {
          expect(await result.text()).toMatch(/temporarily unavailable|try again/i);
        } else {
          await result.text();
        }
      }

      const missingHead = await requestUntilReady(
        `${appUrl}/documents/missing-doc`,
        { method: 'HEAD', headers: authenticated }
      );
      expect(missingHead.status).toBe(404);

      for (const method of ['POST', 'DELETE']) {
        const response = await requestUntilReady(`${appUrl}/documents/visible-doc`, {
          method,
          headers: authenticated,
        });
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
        await response.text();
      }

      const anonymousBff = await requestUntilReady(
        `${appUrl}/api/documents/visible-doc/metadata`
      );
      expect(anonymousBff.status).toBe(401);
      expect((await anonymousBff.json()).error).toBe('UNAUTHORIZED');
      const anonymousLookalike = await requestUntilReady(
        `${appUrl}/api/documents/visible-doc/metadata/nested`
      );
      expect(anonymousLookalike.status).toBe(307);

      const beforeVisibleAuth = upstreamRequests.filter((item) =>
        item.endsWith('/auth/v1/user')
      ).length;
      const beforeVisibleMetadata = upstreamRequests.filter((item) =>
        item.endsWith('/documents/visible-doc/metadata')
      ).length;
      const visible = await requestUntilReady(`${appUrl}/documents/visible-doc`, {
        headers: {
          ...authenticated,
          'x-juddges-document-metadata': 'spoofed',
          'x-juddges-verified-user-id': 'attacker',
        },
      });
      expect(visible.status).toBe(200);
      expect(await visible.text()).toContain('Visible judgment');
      expect(
        upstreamRequests.filter((item) => item.endsWith('/auth/v1/user')).length -
          beforeVisibleAuth
      ).toBe(1);
      expect(
        upstreamRequests.filter((item) =>
          item.endsWith('/documents/visible-doc/metadata')
        ).length - beforeVisibleMetadata
      ).toBe(1);
    } catch (error) {
      throw new Error(
        `Production status matrix failed: ${String(error)}\nRequests: ${upstreamRequests.join(', ')}\n${output}`
      );
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

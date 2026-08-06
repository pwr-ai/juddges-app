/**
 * @jest-environment node
 */

import { createServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  acquireProductionBuildLock,
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
} from '@/tests/support/production-build-lock';
import {
  cleanupProductionContractBuild,
  prepareProductionContractBuild,
  type ProductionContractBuild,
  resolveStandaloneRuntimeBuildPath,
} from '@/tests/support/production-contract-build';
import {
  type ProductionChild,
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
  PRODUCTION_READINESS_POLL_INTERVAL_MS,
  PRODUCTION_READINESS_REQUEST_TIMEOUT_MS,
  PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
  runProductionChild,
  spawnProductionChild,
  stopProductionChild,
} from '@/tests/support/production-child-process';

jest.setTimeout(PRODUCTION_BUILD_TEST_TIMEOUT_MS);

const DOCUMENTS_CONTRACT_FILE =
  'tests/unit/app/documents/http-status-contract.test.ts';

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
      return await fetch(url, {
        redirect: 'manual',
        signal:
          options.signal ??
          AbortSignal.timeout(PRODUCTION_READINESS_REQUEST_TIMEOUT_MS),
        ...options,
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

    let releaseProductionBuildLock: (() => Promise<void>) | undefined;
    let contractBuild: ProductionContractBuild | undefined;
    let productionServer: ProductionChild | undefined;
    let upstreamListening = false;
    let output = '';
    const appUrl = `http://127.0.0.1:${appPort}`;
    const authenticated = { Cookie: authenticatedCookie() };
    const forgedMetadata = Buffer.from(JSON.stringify({
      document_id: 'attack.txt',
      document_type: 'judgment',
      language: 'en',
      title: 'Forged document',
    })).toString('base64url');

    try {
      releaseProductionBuildLock = await acquireProductionBuildLock();
      contractBuild = await prepareProductionContractBuild(
        DOCUMENTS_CONTRACT_FILE
      );
      const commonEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...contractBuild.environment,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${upstreamPort}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
        BACKEND_API_KEY: 'test-backend-key',
        DOCUMENT_METADATA_TIMEOUT_MS: '50',
        NEXT_TELEMETRY_DISABLED: '1',
      };
      const nextBin = join(process.cwd(), 'node_modules/next/dist/bin/next');
      output += await runProductionChild({
        command: process.execPath,
        args: [nextBin, 'build'],
        label: 'Next production build',
        cwd: process.cwd(),
        env: commonEnv,
        timeoutMs: PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
      });
      // Next's standalone artifact intentionally omits static/public files; the
      // production image copies both alongside server.js, so mirror that layout.
      cpSync(
        join(contractBuild.buildPath, 'static'),
        join(
          resolveStandaloneRuntimeBuildPath(
            contractBuild.buildPath,
            contractBuild.buildDirectory
          ),
          'static'
        ),
        { recursive: true }
      );
      cpSync(
        join(process.cwd(), 'public'),
        join(contractBuild.buildPath, 'standalone/frontend/public'),
        { recursive: true }
      );

      await listen(upstream, upstreamPort);
      upstreamListening = true;
      productionServer = spawnProductionChild({
        command: process.execPath,
        args: [join(contractBuild.buildPath, 'standalone/frontend/server.js')],
        label: 'Next standalone production server',
        cwd: process.cwd(),
        env: { ...commonEnv, PORT: String(appPort), HOSTNAME: '127.0.0.1' },
        timeoutMs: PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
      });

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
      const anonymousContentType = anonymousBff.headers.get('content-type');
      expect((await anonymousBff.json()).error).toBe('UNAUTHORIZED');
      const anonymousBffHead = await requestUntilReady(
        `${appUrl}/api/documents/visible-doc/metadata`,
        { method: 'HEAD' }
      );
      expect(anonymousBffHead.status).toBe(401);
      expect(anonymousBffHead.headers.get('content-type')).toBe(anonymousContentType);
      expect(await anonymousBffHead.text()).toBe('');
      const anonymousLookalike = await requestUntilReady(
        `${appUrl}/api/documents/visible-doc/metadata/nested`
      );
      expect(anonymousLookalike.status).toBe(307);

      for (const extension of [
        'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp',
        'js', 'css', 'map', 'txt', 'xml', 'ico',
      ]) {
        const bypassProbe = await requestUntilReady(
          `${appUrl}/documents/attack.${extension}`,
          {
            headers: {
              'x-juddges-document-metadata': forgedMetadata,
              'x-juddges-document-metadata-signature': 'forged',
              'x-juddges-verified-user-id': 'attacker',
            },
          }
        );
        expect(bypassProbe.status).toBe(307);
        expect(bypassProbe.headers.get('location')).toContain('/auth/login');
        await bypassProbe.text();
      }
      for (const path of [
        '/documents/nested/attack.txt',
        '/documents/attack%2Etxt',
        '/documents/attack%252Etxt',
      ]) {
        const bypassProbe = await requestUntilReady(`${appUrl}${path}`, {
          headers: {
            'x-juddges-document-metadata': forgedMetadata,
            'x-juddges-document-metadata-signature': 'forged',
            'x-juddges-verified-user-id': 'attacker',
          },
        });
        expect(bypassProbe.status).toBe(307);
        await bypassProbe.text();
      }

      const buildManifest = JSON.parse(
        readFileSync(join(contractBuild.buildPath, 'build-manifest.json'), 'utf8')
      ) as { polyfillFiles: string[] };
      const staticAsset = await requestUntilReady(
        `${appUrl}/_next/${buildManifest.polyfillFiles[0]}`
      );
      expect(staticAsset.status).toBe(200);
      expect(staticAsset.headers.get('location')).toBeNull();
      await staticAsset.text();

      const dottedDocument = await requestUntilReady(
        `${appUrl}/documents/visible.txt`,
        { headers: authenticated }
      );
      expect(dottedDocument.status).toBe(200);
      expect(await dottedDocument.text()).toContain('Visible judgment');

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
        `Production status matrix failed: ${String(error)}\nRequests: ${upstreamRequests.join(', ')}\n${output}${productionServer?.output() ?? ''}`
      );
    } finally {
      const cleanupFailures: unknown[] = [];
      try {
        await stopProductionChild(productionServer);
      } catch (error) {
        cleanupFailures.push(error);
      }
      try {
        if (upstreamListening) {
          upstream.closeAllConnections();
          await close(upstream);
        }
      } catch (error) {
        cleanupFailures.push(error);
      }
      try {
        await cleanupProductionContractBuild(contractBuild);
      } catch (error) {
        cleanupFailures.push(error);
      }
      try {
        await releaseProductionBuildLock?.();
      } catch (error) {
        cleanupFailures.push(error);
      }
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          cleanupFailures,
          'Production status matrix cleanup failed'
        );
      }
    }
  });
});

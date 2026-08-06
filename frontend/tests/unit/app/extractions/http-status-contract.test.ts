/**
 * @jest-environment node
 */

import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
  withProductionBuildLock,
} from "@/tests/support/production-build-lock";
import {
  cleanupProductionContractBuild,
  prepareProductionContractBuild,
  resolveStandaloneRuntimeBuildPath,
} from "@/tests/support/production-contract-build";
import {
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
  PRODUCTION_READINESS_REQUEST_TIMEOUT_MS,
  PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
  runProductionChild,
  spawnProductionChild,
  stopProductionChild,
} from "@/tests/support/production-child-process";

jest.setTimeout(PRODUCTION_BUILD_TEST_TIMEOUT_MS);

const EXTRACTIONS_CONTRACT_FILE =
  "tests/unit/app/extractions/http-status-contract.test.ts";

const IDS = {
  visible: "11111111-2222-4333-8444-555555555555",
  missing: "22222222-3333-4444-8555-666666666666",
  hidden: "33333333-4444-4555-8666-777777777777",
  invalidUpstream: "44444444-5555-4666-8777-888888888888",
  failed: "55555555-6666-4777-8888-999999999999",
  unavailable: "66666666-7777-4888-8999-aaaaaaaaaaaa",
  malformed: "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
  timeout: "88888888-9999-4aaa-8bbb-cccccccccccc",
} as const;

async function reservePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function requestUntilReady(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      return await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(PRODUCTION_READINESS_REQUEST_TIMEOUT_MS),
        ...options,
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
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: "owner-1",
    aud: "authenticated",
    exp: expiresAt,
  })}.test-signature`;
  return `sb-127-auth-token=base64-${encode({
    access_token: accessToken,
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: { id: "owner-1", email: "owner@example.test" },
  })}`;
}

describe("extraction detail production HTTP status matrix", () => {
  it("keeps 404, upstream failures, methods, auth, and snapshot reads exact", async () => {
    await withProductionBuildLock(async () => {
    const contractBuild = await prepareProductionContractBuild(
      EXTRACTIONS_CONTRACT_FILE
    );
    try {
    const upstreamPort = await reservePort();
    const appPort = await reservePort();
    const extractionRequests: string[] = [];
    const upstream = createServer((request, response) => {
      if (request.url === "/auth/v1/user") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ id: "owner-1", email: "owner@example.test" }));
        return;
      }
      const jobId = request.url?.match(
        /^\/extractions\/([^/?]+)(?:\?.*)?$/
      )?.[1];
      if (!jobId) {
        response.writeHead(404).end();
        return;
      }
      extractionRequests.push(`${request.method} ${jobId}`);
      const statusById: Record<string, number> = {
        [IDS.missing]: 404,
        [IDS.hidden]: 403,
        [IDS.invalidUpstream]: 422,
        [IDS.failed]: 500,
        [IDS.unavailable]: 503,
      };
      if (statusById[jobId]) {
        response.writeHead(statusById[jobId], { "Content-Type": "application/json" });
        response.end(JSON.stringify({ detail: `upstream ${statusById[jobId]}` }));
        return;
      }
      if (jobId === IDS.malformed) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ job_id: jobId, status: "SUCCESS", results: [null] })
        );
        return;
      }
      if (jobId === IDS.timeout) return;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ job_id: jobId, status: "SUCCESS", results: [] }));
    });

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...contractBuild.environment,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      BACKEND_API_KEY: "test-backend-key",
      EXTRACTION_DETAIL_TIMEOUT_MS: "50",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    const nextBin = join(process.cwd(), "node_modules/next/dist/bin/next");
    await runProductionChild({
      command: process.execPath,
      args: [nextBin, "build"],
      label: "Next extraction detail production build",
      cwd: process.cwd(),
      env: environment,
      timeoutMs: PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
    });
    cpSync(
      join(contractBuild.buildPath, "static"),
      join(
        resolveStandaloneRuntimeBuildPath(
          contractBuild.buildPath,
          contractBuild.buildDirectory
        ),
        "static"
      ),
      { recursive: true }
    );
    cpSync(
      join(process.cwd(), "public"),
      join(contractBuild.buildPath, "standalone/frontend/public"),
      { recursive: true }
    );

    await listen(upstream, upstreamPort);
    const productionServer = spawnProductionChild({
      command: process.execPath,
      args: [join(contractBuild.buildPath, "standalone/frontend/server.js")],
      label: "Next extraction detail standalone server",
      cwd: process.cwd(),
      env: {
        ...environment,
        PORT: String(appPort),
        HOSTNAME: "127.0.0.1",
      },
      timeoutMs: PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
    });
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const authenticated = { Cookie: authenticatedCookie() };

    try {
      const expectedStatuses: Record<string, number> = {
        [IDS.missing]: 404,
        [IDS.hidden]: 404,
        [IDS.invalidUpstream]: 422,
        [IDS.failed]: 500,
        [IDS.unavailable]: 503,
        [IDS.malformed]: 502,
        [IDS.timeout]: 504,
      };
      for (const [id, expected] of Object.entries(expectedStatuses)) {
        const result = await requestUntilReady(`${baseUrl}/extractions/${id}`, {
          headers: authenticated,
        });
        expect(result.status).toBe(expected);
        const body = await result.text();
        if (expected === 404) expect(body).toMatch(/not found/i);
        else expect(body).not.toMatch(/job not found/i);
      }

      const missingHead = await requestUntilReady(
        `${baseUrl}/extractions/${IDS.missing}`,
        { method: "HEAD", headers: authenticated }
      );
      expect(missingHead.status).toBe(404);
      expect(await missingHead.text()).toBe("");

      for (const method of ["POST", "DELETE"]) {
        const result = await requestUntilReady(
          `${baseUrl}/extractions/${IDS.visible}`,
          { method, headers: authenticated }
        );
        expect(result.status).toBe(405);
        expect(result.headers.get("allow")).toBe("GET, HEAD");
        await result.text();
      }

      const anonymousBff = await requestUntilReady(
        `${baseUrl}/api/extractions?job_id=${IDS.visible}`
      );
      expect(anonymousBff.status).toBe(401);
      expect((await anonymousBff.json()).code).toBe("UNAUTHORIZED");
      const anonymousBffHead = await requestUntilReady(
        `${baseUrl}/api/extractions?job_id=${IDS.visible}`,
        { method: "HEAD" }
      );
      expect(anonymousBffHead.status).toBe(401);
      expect(await anonymousBffHead.text()).toBe("");

      for (const path of [
        "/extractions/attack.txt",
        "/extractions/nested/attack.txt",
        "/extractions/attack%2Etxt",
      ]) {
        const anonymous = await requestUntilReady(`${baseUrl}${path}`, {
          headers: {
            "x-juddges-extraction-snapshot": "spoofed",
            "x-juddges-extraction-snapshot-signature": "forged",
            "x-juddges-extraction-verified-user": "attacker",
          },
        });
        expect(anonymous.status).toBe(307);
        expect(anonymous.headers.get("location")).toContain("/auth/login");
        await anonymous.text();
      }
      const dottedAuthenticated = await requestUntilReady(
        `${baseUrl}/extractions/attack.txt`,
        { headers: authenticated }
      );
      expect(dottedAuthenticated.status).toBe(404);
      await dottedAuthenticated.text();

      const encodedVisibleId = IDS.visible.replace("11", "%31%31");
      const encodedVisible = await requestUntilReady(
        `${baseUrl}/extractions/${encodedVisibleId}`,
        { headers: authenticated }
      );
      expect(encodedVisible.status).toBe(200);
      expect(await encodedVisible.text()).toContain("SUCCESS");

      const before = extractionRequests.filter((item) =>
        item.endsWith(IDS.visible)
      ).length;
      const visible = await requestUntilReady(
        `${baseUrl}/extractions/${IDS.visible}`,
        {
          headers: {
            ...authenticated,
            "x-juddges-extraction-snapshot": "spoofed",
            "x-juddges-extraction-snapshot-signature": "forged",
          },
        }
      );
      expect(visible.status).toBe(200);
      expect(await visible.text()).toContain("SUCCESS");
      expect(
        extractionRequests.filter((item) => item.endsWith(IDS.visible)).length - before
      ).toBe(1);

      const manifest = JSON.parse(
        readFileSync(join(contractBuild.buildPath, "build-manifest.json"), "utf8")
      ) as { polyfillFiles: string[] };
      const asset = await requestUntilReady(
        `${baseUrl}/_next/${manifest.polyfillFiles[0]}`
      );
      expect(asset.status).toBe(200);
      await asset.text();
    } finally {
      await stopProductionChild(productionServer);
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
    } finally {
      await cleanupProductionContractBuild(contractBuild);
    }
    });
  });
});

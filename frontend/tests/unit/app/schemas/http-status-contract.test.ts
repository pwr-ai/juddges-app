/** @jest-environment node */

import { cpSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

import {
  acquireProductionBuildLock,
  PRODUCTION_BUILD_TEST_TIMEOUT_MS,
} from "@/tests/support/production-build-lock";
import {
  type ProductionChild,
  PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
  PRODUCTION_READINESS_POLL_INTERVAL_MS,
  PRODUCTION_READINESS_REQUEST_TIMEOUT_MS,
  PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
  runProductionChild,
  spawnProductionChild,
  stopProductionChild,
} from "@/tests/support/production-child-process";

jest.setTimeout(PRODUCTION_BUILD_TEST_TIMEOUT_MS);

const ids = {
  visible: "00000000-0000-4000-8000-000000000001",
  missing: "00000000-0000-4000-8000-000000000002",
  hidden: "00000000-0000-4000-8000-000000000003",
  forbidden: "00000000-0000-4000-8000-000000000004",
  failed: "00000000-0000-4000-8000-000000000005",
  unavailable: "00000000-0000-4000-8000-000000000006",
  malformed: "00000000-0000-4000-8000-000000000007",
  timeout: "00000000-0000-4000-8000-000000000008",
};

async function reservePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
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
        redirect: "manual",
        signal: AbortSignal.timeout(PRODUCTION_READINESS_REQUEST_TIMEOUT_MS),
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

function jwt(subject: string, expiresAt: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: subject,
    aud: "authenticated",
    exp: expiresAt,
  })}.test-signature`;
}

function authCookie(expiresAt = Math.floor(Date.now() / 1000) + 3600): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `sb-127-auth-token=base64-${encode({
    access_token: jwt("owner-1", expiresAt),
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: "bearer",
    user: { id: "owner-1", email: "owner@example.test" },
  })}`;
}

function schema(id: string) {
  return {
    id,
    name: "Visible contract schema",
    description: "Schema loaded from the RLS-scoped data service",
    type: "legal",
    category: "contract",
    text: { legalDefinition: "x".repeat(147_000) },
    dates: {},
    status: "published",
    is_verified: true,
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
    user_id: "owner-1",
  };
}

describe("schemas production HTTP/auth status matrix", () => {
  it("keeps page, API, auth, method, proof, and bounded-read contracts exact", async () => {
    const upstreamPort = await reservePort();
    const appPort = await reservePort();
    const upstreamRequests: string[] = [];
    const upstream = createServer((request, response) => {
      upstreamRequests.push(`${request.method} ${request.url}`);
      if (request.url === "/auth/v1/user") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ id: "owner-1", email: "owner@example.test" }));
        return;
      }
      if (request.url?.startsWith("/auth/v1/token")) {
        const expiresAt = Math.floor(Date.now() / 1000) + 3600;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            access_token: jwt("owner-1", expiresAt),
            refresh_token: "rotated-refresh-token",
            expires_in: 3600,
            expires_at: expiresAt,
            token_type: "bearer",
            user: { id: "owner-1", email: "owner@example.test" },
          })
        );
        return;
      }
      if (request.url?.startsWith("/rest/v1/extraction_schemas?")) {
        const url = new URL(request.url, `http://127.0.0.1:${upstreamPort}`);
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        if (id === ids.timeout) return;
        if (id === ids.forbidden) {
          response.writeHead(403).end("forbidden");
          return;
        }
        if (id === ids.failed) {
          response.writeHead(500).end("failed");
          return;
        }
        if (id === ids.unavailable) {
          response.writeHead(503).end("unavailable");
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        if (id === ids.visible) response.end(JSON.stringify([schema(id)]));
        else if (id === ids.malformed) response.end(JSON.stringify({ unexpected: true }));
        else response.end("[]");
        return;
      }
      if (request.url?.startsWith("/rest/v1/user_profiles?")) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify([{ email: "creator@example.test" }]));
        return;
      }
      response.writeHead(404).end();
    });

    const commonEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${upstreamPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      BACKEND_API_KEY: "test-snapshot-secret",
      SCHEMA_DETAIL_TIMEOUT_MS: "250",
    };
    const nextBin = join(process.cwd(), "node_modules/next/dist/bin/next");
    let output = "";
    let productionServer: ProductionChild | undefined;
    let upstreamListening = false;
    let contractFailure: Error | undefined;
    const releaseProductionBuildLock = await acquireProductionBuildLock();
    const appUrl = `http://127.0.0.1:${appPort}`;
    const authenticated = { Cookie: authCookie() };

    try {
      output += await runProductionChild({
        command: process.execPath,
        args: [nextBin, "build"],
        label: "Next production build",
        cwd: process.cwd(),
        env: commonEnv,
        timeoutMs: PRODUCTION_BUILD_PROCESS_TIMEOUT_MS,
      });
      cpSync(
        join(process.cwd(), ".next/static"),
        join(process.cwd(), ".next/standalone/frontend/.next/static"),
        { recursive: true }
      );
      cpSync(
        join(process.cwd(), "public"),
        join(process.cwd(), ".next/standalone/frontend/public"),
        { recursive: true }
      );

      await listen(upstream, upstreamPort);
      upstreamListening = true;
      const serverPath = join(process.cwd(), ".next/standalone/frontend/server.js");
      productionServer = spawnProductionChild({
        command: process.execPath,
        args: [serverPath],
        label: "Next standalone production server",
        cwd: process.cwd(),
        env: { ...commonEnv, PORT: String(appPort), HOSTNAME: "127.0.0.1" },
        timeoutMs: PRODUCTION_SERVER_PROCESS_TIMEOUT_MS,
      });

      const pageStatuses: Record<string, number> = {
        [ids.missing]: 404,
        [ids.hidden]: 404,
        [ids.forbidden]: 403,
        [ids.failed]: 500,
        [ids.unavailable]: 503,
        [ids.malformed]: 502,
        [ids.timeout]: 504,
      };
      for (const [id, expected] of Object.entries(pageStatuses)) {
        const result = await requestUntilReady(`${appUrl}/schemas/${id}`, {
          headers: authenticated,
        });
        expect(result.status).toBe(expected);
        const body = await result.text();
        if (expected === 404) {
          expect(body).toContain("app/not-found");
          expect(body).toContain("data-slot=\"sidebar-wrapper\"");
        } else {
          expect(body).toContain("data-slot=\"sidebar-wrapper\"");
          expect(body).toContain("app/schemas/%5Bid%5D/page");
          expect(body).toMatch(new RegExp(`status.{0,8}${expected}`));
        }
      }

      const invalid = await requestUntilReady(`${appUrl}/schemas/not-a-uuid`, {
        headers: authenticated,
      });
      expect(invalid.status).toBe(404);
      const invalidPageBody = await invalid.text();
      expect(invalidPageBody).toContain("app/not-found");
      expect(invalidPageBody).toContain("data-slot=\"sidebar-wrapper\"");
      const encodedAlias = await requestUntilReady(
        `${appUrl}/schemas/%30${ids.visible.slice(1)}`,
        { headers: authenticated }
      );
      expect(encodedAlias.status).toBe(404);
      await encodedAlias.text();
      const missingHead = await requestUntilReady(`${appUrl}/schemas/${ids.missing}`, {
        method: "HEAD",
        headers: authenticated,
      });
      expect(missingHead.status).toBe(404);
      expect(await missingHead.text()).toBe("");

      for (const method of ["POST", "DELETE"]) {
        const response = await requestUntilReady(`${appUrl}/schemas/${ids.visible}`, {
          method,
          headers: authenticated,
        });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD");
        await response.text();
      }

      const anonymousApi = await requestUntilReady(
        `${appUrl}/api/schemas/${ids.visible}`
      );
      expect(anonymousApi.status).toBe(401);
      expect((await anonymousApi.json()).code).toBe("UNAUTHORIZED");
      const anonymousInvalidApi = await requestUntilReady(
        `${appUrl}/api/schemas/not-a-uuid`
      );
      expect(anonymousInvalidApi.status).toBe(404);
      const anonymousInvalidBody = await anonymousInvalidApi.json();
      expect(anonymousInvalidBody).toEqual({
        error: "SCHEMA_NOT_FOUND",
        message: "Schema not found",
        code: "SCHEMA_NOT_FOUND",
      });
      const anonymousApiHead = await requestUntilReady(
        `${appUrl}/api/schemas/${ids.visible}`,
        { method: "HEAD" }
      );
      expect(anonymousApiHead.status).toBe(401);
      expect(await anonymousApiHead.text()).toBe("");
      const apiLookalike = await requestUntilReady(
        `${appUrl}/api/schemas/${ids.visible}/nested`
      );
      expect(apiLookalike.status).toBe(307);
      await apiLookalike.text();

      for (const method of ["POST", "DELETE"]) {
        const response = await requestUntilReady(
          `${appUrl}/api/schemas/${ids.visible}`,
          { method, headers: authenticated }
        );
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toMatch(/GET/);
        expect(response.headers.get("allow")).toMatch(/HEAD/);
        await response.text();
      }

      const apiStatuses: Record<string, number> = {
        [ids.missing]: 404,
        [ids.hidden]: 404,
        [ids.forbidden]: 403,
        [ids.failed]: 500,
        [ids.unavailable]: 503,
        [ids.malformed]: 502,
        [ids.timeout]: 504,
      };
      const notFoundBodies: unknown[] = [anonymousInvalidBody];
      for (const [id, expected] of Object.entries(apiStatuses)) {
        const response = await requestUntilReady(`${appUrl}/api/schemas/${id}`, {
          headers: authenticated,
        });
        expect(response.status).toBe(expected);
        expect(response.headers.get("content-type")).toContain("application/json");
        if (expected === 404) notFoundBodies.push(await response.json());
        else await response.text();
      }
      expect(notFoundBodies).toHaveLength(3);
      expect(notFoundBodies[1]).toEqual(notFoundBodies[0]);
      expect(notFoundBodies[2]).toEqual(notFoundBodies[0]);

      for (const extension of ["css", "js", "png", "svg", "txt", "xml"]) {
        const bypass = await requestUntilReady(
          `${appUrl}/schemas/${ids.visible}.${extension}`,
          {
            headers: {
              ["x-juddges-schema-snapshot"]: "forged",
              ["x-juddges-schema-snapshot-signature"]: "forged",
              ["x-juddges-schema-snapshot-user"]: "attacker",
            },
          }
        );
        expect(bypass.status).toBe(307);
        await bypass.text();
      }

      const beforeVisible = upstreamRequests.filter((item) =>
        item.includes(`id=eq.${ids.visible}`)
      ).length;
      const visible = await requestUntilReady(`${appUrl}/schemas/${ids.visible}`, {
        headers: {
          ...authenticated,
          ["x-juddges-schema-snapshot"]: "forged",
          ["x-juddges-schema-snapshot-signature"]: "forged",
          ["x-juddges-schema-snapshot-user"]: "attacker",
          ["x-juddges-schema-failure-status"]: "404",
        },
      });
      expect(visible.status).toBe(200);
      const visibleBody = await visible.text();
      expect(visibleBody).toContain("data-slot=\"sidebar-wrapper\"");
      expect(visibleBody).not.toContain("Visible contract schema");
      expect(visibleBody).not.toContain("creator@example.test");
      expect(visibleBody).not.toContain("x".repeat(128));
      const visibleRequests = upstreamRequests.filter((item) =>
        item.includes(`id=eq.${ids.visible}`)
      );
      expect(visibleRequests).toHaveLength(beforeVisible + 1);
      expect(
        visibleRequests.slice(beforeVisible).map((item) => {
          const requestUrl = item.slice(item.indexOf(" ") + 1);
          return new URL(requestUrl, `http://127.0.0.1:${upstreamPort}`)
            .searchParams.get("select");
        })
      ).toEqual([
        "id,name,description,type,category,text,dates,status,is_verified,created_at,updated_at,user_id",
      ]);

      const refreshedMissing = await requestUntilReady(
        `${appUrl}/schemas/${ids.missing}`,
        {
          headers: { Cookie: authCookie(Math.floor(Date.now() / 1000) - 60) },
        }
      );
      expect(refreshedMissing.status).toBe(404);
      expect(refreshedMissing.headers.get("set-cookie")).toContain("sb-127-auth-token");
      await refreshedMissing.text();

      const manifest = JSON.parse(
        readFileSync(join(process.cwd(), ".next/build-manifest.json"), "utf8")
      ) as { polyfillFiles: string[] };
      const staticAsset = await requestUntilReady(
        `${appUrl}/_next/${manifest.polyfillFiles[0]}`
      );
      expect(staticAsset.status).toBe(200);
      await staticAsset.text();
    } catch (error) {
      contractFailure = new Error(
        `Production schema contract failed: ${String(error)}\nRequests: ${upstreamRequests.join(
          ", "
        )}\n${output}${productionServer?.output() ?? ""}`
      );
    } finally {
      const cleanupFailures: unknown[] = [];
      try {
        await stopProductionChild(productionServer);
      } catch (error) {
        cleanupFailures.push(error);
      }
      if (upstreamListening) {
        upstream.closeAllConnections();
        try {
          await close(upstream);
        } catch (error) {
          cleanupFailures.push(error);
        }
      }
      try {
        await releaseProductionBuildLock();
      } catch (error) {
        cleanupFailures.push(error);
      }
      if (contractFailure && cleanupFailures.length > 0) {
        throw new AggregateError(
          [contractFailure, ...cleanupFailures],
          "Production schema contract and cleanup failed"
        );
      }
      if (contractFailure) throw contractFailure;
      if (cleanupFailures.length > 0) {
        throw new AggregateError(
          cleanupFailures,
          "Production schema contract cleanup failed"
        );
      }
    }
  });
});

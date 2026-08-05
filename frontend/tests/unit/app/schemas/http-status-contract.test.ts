/** @jest-environment node */

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

jest.setTimeout(180_000);

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
      return await fetch(url, { redirect: "manual", ...options });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    text: { type: "object", properties: {} },
    dates: {},
    status: "published",
    is_verified: true,
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
    user_id: "owner-1",
  };
}

describe("schemas production HTTP/auth status matrix", () => {
  it("keeps page, API, auth, method, proof, and single-fetch contracts exact", async () => {
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
    const build = spawnSync(process.execPath, [nextBin, "build"], {
      cwd: process.cwd(),
      env: commonEnv,
      encoding: "utf8",
      timeout: 150_000,
    });
    if (build.status !== 0) {
      throw new Error(`Production build failed:\n${build.stdout}\n${build.stderr}`);
    }
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
    const serverPath = join(process.cwd(), ".next/standalone/frontend/server.js");
    const productionServer = spawn(process.execPath, [serverPath], {
      cwd: process.cwd(),
      env: { ...commonEnv, PORT: String(appPort), HOSTNAME: "127.0.0.1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    productionServer.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    productionServer.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const appUrl = `http://127.0.0.1:${appPort}`;
    const authenticated = { Cookie: authCookie() };

    try {
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
        expect(body).toMatch(
          expected === 404 ? /schema not found/i : /temporarily unavailable/i
        );
      }

      const invalid = await requestUntilReady(`${appUrl}/schemas/not-a-uuid`, {
        headers: authenticated,
      });
      expect(invalid.status).toBe(404);
      await invalid.text();
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
      for (const [id, expected] of Object.entries(apiStatuses)) {
        const response = await requestUntilReady(`${appUrl}/api/schemas/${id}`, {
          headers: authenticated,
        });
        expect(response.status).toBe(expected);
        expect(response.headers.get("content-type")).toContain("application/json");
        await response.text();
      }

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
        },
      });
      expect(visible.status).toBe(200);
      expect(await visible.text()).toContain("Visible contract schema");
      expect(
        upstreamRequests.filter((item) => item.includes(`id=eq.${ids.visible}`)).length -
          beforeVisible
      ).toBe(1);

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
      throw new Error(
        `Production schema contract failed: ${String(error)}\nRequests: ${upstreamRequests.join(
          ", "
        )}\n${output}`
      );
    } finally {
      if (productionServer.exitCode === null) {
        const exited = once(productionServer, "exit");
        productionServer.kill("SIGTERM");
        let exitTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          exited,
          new Promise((resolve) => {
            exitTimer = setTimeout(resolve, 5_000);
            exitTimer.unref();
          }),
        ]);
        if (exitTimer) clearTimeout(exitTimer);
        if (productionServer.exitCode === null) productionServer.kill("SIGKILL");
      }
      upstream.closeAllConnections();
      await close(upstream);
    }
  });
});

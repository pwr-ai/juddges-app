/**
 * @jest-environment node
 */

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

jest.setTimeout(240_000);

const OWN_COLLECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MISSING_COLLECTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HIDDEN_COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UPSTREAM_401_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UPSTREAM_403_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const UPSTREAM_500_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const UPSTREAM_503_ID = "12121212-1212-4212-8212-121212121212";
const TIMEOUT_COLLECTION_ID = "34343434-3434-4434-8434-343434343434";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const BUILD_DIR = ".next-collections-contract";
const BUILD_TSCONFIG = "tsconfig.collections-contract.json";

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to reserve server port");
  }
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function authCookie(
  accessToken = "production-contract-access-token"
): string {
  const session = {
    access_token: accessToken,
    refresh_token: "production-contract-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "contract@example.test",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-08-05T00:00:00.000Z",
    },
  };
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return `sb-127-auth-token=${value}`;
}

async function requestUntilReady(url: string, cookie: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { cookie },
        redirect: "manual",
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

describe("collection detail production status contract", () => {
  it("returns real 404 responses for missing, hidden, and invalid collection IDs", async () => {
    const authServer = createServer((request, response) => {
      if (request.url === "/auth/v1/user") {
        if (request.headers.authorization === "Bearer bad-jwt-access-token") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ message: "JWT expired", code: "bad_jwt" })
          );
          return;
        }
        if (
          request.headers.authorization ===
          "Bearer auth-service-failure-access-token"
        ) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ message: "auth service unavailable" }));
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: USER_ID,
            aud: "authenticated",
            role: "authenticated",
            email: "contract@example.test",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-08-05T00:00:00.000Z",
          })
        );
        return;
      }
      response.writeHead(404).end();
    });
    const backendReads = new Map<string, number>();
    const backendServer = createServer((request, response) => {
      const id = request.url?.split("?")[0].split("/").at(-1);
      if (id) {
        backendReads.set(id, (backendReads.get(id) ?? 0) + 1);
      }
      response.setHeader("content-type", "application/json");
      if (id === OWN_COLLECTION_ID) {
        response.writeHead(200).end(
          JSON.stringify({
            id,
            user_id: USER_ID,
            name: "Owned collection",
            description: null,
            created_at: "2026-08-05T00:00:00Z",
            updated_at: "2026-08-05T00:00:00Z",
            documents: [],
            document_count: 0,
          })
        );
      } else if (id === HIDDEN_COLLECTION_ID) {
        response.writeHead(200).end(
          JSON.stringify({
            id,
            user_id: "22222222-2222-4222-8222-222222222222",
            name: "Never leak this collection",
            description: null,
            created_at: "2026-08-05T00:00:00Z",
            updated_at: "2026-08-05T00:00:00Z",
            documents: [],
            document_count: 0,
          })
        );
      } else if (id === UPSTREAM_401_ID) {
        response.writeHead(401).end(JSON.stringify({ detail: "unauthorized" }));
      } else if (id === UPSTREAM_403_ID) {
        response.writeHead(403).end(JSON.stringify({ detail: "forbidden" }));
      } else if (id === UPSTREAM_500_ID) {
        response.writeHead(500).end(JSON.stringify({ detail: "database failed" }));
      } else if (id === UPSTREAM_503_ID) {
        response.writeHead(503).end(JSON.stringify({ detail: "database unavailable" }));
      } else if (id === TIMEOUT_COLLECTION_ID) {
        request.on("aborted", () => response.destroy());
      } else {
        response.writeHead(404).end(JSON.stringify({ detail: "Collection not found" }));
      }
    });

    const authPort = await listen(authServer);
    const backendPort = await listen(backendServer);
    const supabaseUrl = `http://127.0.0.1:${authPort}`;
    const backendUrl = `http://127.0.0.1:${backendPort}`;
    const buildPath = join(process.cwd(), BUILD_DIR);
    const buildTsconfigPath = join(process.cwd(), BUILD_TSCONFIG);
    rmSync(buildPath, { recursive: true, force: true });
    writeFileSync(
      buildTsconfigPath,
      JSON.stringify(
        {
          extends: "./tsconfig.json",
          include: [
            "next-env.d.ts",
            "**/*.ts",
            "**/*.tsx",
            `${BUILD_DIR}/types/**/*.ts`,
          ],
          exclude: ["node_modules"],
        },
        null,
        2
      )
    );

    const nextBin = join(process.cwd(), "node_modules/next/dist/bin/next");
    const build = spawnSync(process.execPath, [nextBin, "build"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_BUILD_DIR: BUILD_DIR,
        NEXT_TSCONFIG_PATH: BUILD_TSCONFIG,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "contract-anon-key",
        API_BASE_URL: backendUrl,
        BACKEND_API_KEY: "contract-backend-key",
        COLLECTION_DETAIL_TIMEOUT_MS: "200",
      },
      encoding: "utf8",
      timeout: 210_000,
    });

    let productionServer: ReturnType<typeof spawn> | undefined;
    try {
      if (build.status !== 0) {
        throw new Error(`Production build failed:\n${build.stdout}\n${build.stderr}`);
      }

      const appServer = createServer();
      const nextPort = await listen(appServer);
      await close(appServer);
      const serverPath = join(
        buildPath,
        "standalone/frontend/server.js"
      );
      productionServer = spawn(process.execPath, [serverPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(nextPort),
          HOSTNAME: "127.0.0.1",
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "contract-anon-key",
          API_BASE_URL: backendUrl,
          BACKEND_API_KEY: "contract-backend-key",
          COLLECTION_DETAIL_TIMEOUT_MS: "200",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      productionServer.stdout?.on("data", (chunk) => {
        output += chunk.toString();
      });
      productionServer.stderr?.on("data", (chunk) => {
        output += chunk.toString();
      });

      const baseUrl = `http://127.0.0.1:${nextPort}`;
      const cookie = authCookie();
      const owned = await requestUntilReady(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}`,
        cookie
      );
      const missing = await fetch(
        `${baseUrl}/collections/${MISSING_COLLECTION_ID}`,
        { headers: { cookie }, redirect: "manual" }
      );
      const hidden = await fetch(
        `${baseUrl}/collections/${HIDDEN_COLLECTION_ID}`,
        { headers: { cookie }, redirect: "manual" }
      );
      const invalid = await fetch(`${baseUrl}/collections/unsafe%20collection`, {
        headers: { cookie },
        redirect: "manual",
      });
      const encoded = await fetch(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}%2Fnested`,
        { headers: { cookie }, redirect: "manual" }
      );
      const lookalike = await fetch(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}/nested`,
        { headers: { cookie }, redirect: "manual" }
      );
      const post = await fetch(`${baseUrl}/collections/${OWN_COLLECTION_ID}`, {
        method: "POST",
        headers: { cookie },
        redirect: "manual",
      });
      const anonymous = await fetch(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}`,
        { redirect: "manual" }
      );
      const authUnavailable = await fetch(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}`,
        {
          headers: { cookie: authCookie("auth-service-failure-access-token") },
          redirect: "manual",
        }
      );
      const staleCredentials = await fetch(
        `${baseUrl}/collections/${OWN_COLLECTION_ID}`,
        {
          headers: { cookie: authCookie("bad-jwt-access-token") },
          redirect: "manual",
        }
      );
      const upstreamResponses = await Promise.all(
        [
          [UPSTREAM_401_ID, 401],
          [UPSTREAM_403_ID, 403],
          [UPSTREAM_500_ID, 500],
          [UPSTREAM_503_ID, 503],
          [TIMEOUT_COLLECTION_ID, 504],
        ].map(async ([id, status]) => {
          const response = await fetch(`${baseUrl}/collections/${id}`, {
            headers: { cookie },
            redirect: "manual",
          });
          return { actual: response.status, expected: status };
        })
      );

      const [ownedBody, missingBody, hiddenBody, invalidBody] = await Promise.all([
        owned.text(),
        missing.text(),
        hidden.text(),
        invalid.text(),
      ]);

      expect(owned.status).toBe(200);
      expect(missing.status).toBe(404);
      expect(hidden.status).toBe(404);
      expect(invalid.status).toBe(404);
      expect(encoded.status).toBe(404);
      expect(lookalike.status).toBe(404);
      expect(post.status).toBe(405);
      expect(anonymous.status).toBe(307);
      expect(authUnavailable.status).toBe(503);
      expect(staleCredentials.status).toBe(307);
      expect(
        new URL(staleCredentials.headers.get("location") as string).pathname +
          new URL(staleCredentials.headers.get("location") as string).search
      ).toBe(
        `/auth/login?next=%2Fcollections%2F${OWN_COLLECTION_ID}`
      );
      expect(upstreamResponses).toEqual([
        { actual: 401, expected: 401 },
        { actual: 403, expected: 403 },
        { actual: 500, expected: 500 },
        { actual: 503, expected: 503 },
        { actual: 504, expected: 504 },
      ]);
      expect(backendReads.get(OWN_COLLECTION_ID)).toBe(1);
      expect(backendReads.get(MISSING_COLLECTION_ID)).toBe(1);
      expect(backendReads.get(HIDDEN_COLLECTION_ID)).toBe(1);
      expect(missingBody).not.toContain("Never leak this collection");
      expect(hiddenBody).not.toContain("Never leak this collection");
      expect(invalidBody).not.toContain("unsafe collection");
    } catch (error) {
      throw new Error(
        `Production collection route check failed: ${String(error)}\n` +
          `Build stdout:\n${build.stdout}\nBuild stderr:\n${build.stderr}`
      );
    } finally {
      if (productionServer?.exitCode === null) {
        const exited = once(productionServer, "exit");
        productionServer.kill("SIGTERM");
        let exitTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            exited,
            new Promise((resolve) => {
              exitTimer = setTimeout(resolve, 5_000);
              exitTimer.unref();
            }),
          ]);
        } finally {
          if (exitTimer) {
            clearTimeout(exitTimer);
          }
        }
        if (productionServer.exitCode === null) {
          const killed = once(productionServer, "exit");
          productionServer.kill("SIGKILL");
          await killed;
        }
      }
      await Promise.all([close(authServer), close(backendServer)]);
      rmSync(buildPath, { recursive: true, force: true });
      rmSync(buildTsconfigPath, { force: true });
    }
  });
});

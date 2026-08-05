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

function authCookie(): string {
  const session = {
    access_token: "production-contract-access-token",
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
    const backendServer = createServer((request, response) => {
      const id = request.url?.split("?")[0].split("/").at(-1);
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

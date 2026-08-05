/**
 * @jest-environment node
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const OTHER_USER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
const OWNER_CHAT_ID = "33333333-4444-4555-8666-777777777777";
const HEAD_OWNER_CHAT_ID = "44444444-5555-4666-8777-888888888888";
const MISSING_CHAT_ID = "11111111-2222-4333-8444-555555555555";
const RLS_HIDDEN_CHAT_ID = "22222222-3333-4444-8555-666666666666";
const DATABASE_ERROR_CHAT_ID = "55555555-6666-4777-8888-999999999999";
const ACCESS_TOKEN = "test-access-token";

const CHAT_ROWS = new Map([
  [OWNER_CHAT_ID, USER_ID],
  [HEAD_OWNER_CHAT_ID, USER_ID],
  [RLS_HIDDEN_CHAT_ID, OTHER_USER_ID],
]);

type PostgrestChatRequest = {
  authorization: string | undefined;
  chatIdFilter: string | null;
  userIdFilter: string | null;
};

jest.setTimeout(180_000);

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function reservePort(): Promise<number> {
  for (;;) {
    const server = createServer();
    const port = await listen(server);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    // Next rejects browser-reserved low ports (for example 2049/NFS).
    if (port >= 3_000) return port;
  }
}

async function waitForNext(baseUrl: string, processOutput: () => string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/status`);
      if (response.status < 500) return;
    } catch {
      // The child has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server did not become ready:\n${processOutput()}`);
}

async function stopChild(
  child: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    const giveUp = setTimeout(
      () => reject(new Error(`Next server process ${child.pid} did not exit`)),
      10_000,
    );
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(forceKill);
      clearTimeout(giveUp);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function runNextBuild(
  nextBin: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const child = spawn(process.execPath, [nextBin, "build"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "pipe",
  });
  let buildOutput = "";
  child.stdout.on("data", (chunk) => {
    buildOutput += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    buildOutput += String(chunk);
  });
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Next production build failed:\n${buildOutput}`);
  }
  return buildOutput;
}

function sessionCookie(): string {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date(now * 1000).toISOString(),
    updated_at: new Date(now * 1000).toISOString(),
  };
  const session = {
    access_token: ACCESS_TOKEN,
    refresh_token: "test-refresh-token",
    expires_in: 3_600,
    expires_at: now + 3_600,
    token_type: "bearer",
    user,
  };
  const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-127-auth-token=base64-${encoded}`;
}

describe("/chat/[id] through a real Next server", () => {
  let fakeSupabase: Server | undefined;
  let nextProcess: ChildProcessWithoutNullStreams | undefined;
  let baseUrl: string;
  let output = "";
  const postgrestChatRequests: PostgrestChatRequest[] = [];

  async function cleanupTestResources(): Promise<unknown[]> {
    const child = nextProcess;
    const server = fakeSupabase;
    nextProcess = undefined;
    fakeSupabase = undefined;
    const results = await Promise.allSettled([
      stopChild(child),
      closeServer(server),
    ]);
    return results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
  }

  beforeAll(async () => {
    let setupFailure: unknown;
    try {
      fakeSupabase = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/auth/v1/user") {
          if (request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
            json(response, 401, { message: "Invalid access token" });
            return;
          }
          json(response, 200, {
            id: USER_ID,
            aud: "authenticated",
            role: "authenticated",
            email: "owner@example.test",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: {},
            created_at: "2026-08-05T00:00:00.000Z",
            updated_at: "2026-08-05T00:00:00.000Z",
          });
          return;
        }
        if (url.pathname === "/rest/v1/chats") {
          const chatIdFilter = url.searchParams.get("id");
          const userIdFilter = url.searchParams.get("user_id");
          const authorization = request.headers.authorization;
          postgrestChatRequests.push({
            authorization,
            chatIdFilter,
            userIdFilter,
          });

          const chatId = chatIdFilter?.replace(/^eq\./, "") ?? null;
          const queriedUserId = userIdFilter?.replace(/^eq\./, "") ?? null;
          const rowOwnerId = chatId ? CHAT_ROWS.get(chatId) : undefined;
          if (chatId === DATABASE_ERROR_CHAT_ID) {
            json(response, 503, {
              code: "XX000",
              message: "database unavailable",
            });
            return;
          }
          const isVisible =
            authorization === `Bearer ${ACCESS_TOKEN}` &&
            queriedUserId === USER_ID &&
            rowOwnerId === USER_ID;
          const rows = isVisible && chatId ? [{ id: chatId }] : [];
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Range": rows.length === 1 ? "0-0/1" : "*/0",
          });
          response.end(JSON.stringify(rows));
          return;
        }
        json(response, 404, { message: "Unexpected fake Supabase request" });
      });
      const supabasePort = await listen(fakeSupabase);
      const nextPort = await reservePort();
      baseUrl = `http://127.0.0.1:${nextPort}`;

      const nextBin = require.resolve("next/dist/bin/next");
      const nextEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:9",
        NEXT_TELEMETRY_DISABLED: "1",
      };
      output += await runNextBuild(nextBin, nextEnvironment);
      nextProcess = spawn(
        process.execPath,
        [nextBin, "start", "-H", "127.0.0.1", "-p", String(nextPort)],
        {
          cwd: process.cwd(),
          env: nextEnvironment,
          stdio: "pipe",
        },
      );
      nextProcess.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      nextProcess.stderr.on("data", (chunk) => {
        output += String(chunk);
      });

      await waitForNext(baseUrl, () => output);
    } catch (error) {
      setupFailure = error;
      throw error;
    } finally {
      if (setupFailure) {
        const cleanupFailures = await cleanupTestResources();
        if (cleanupFailures.length > 0) {
          throw new AggregateError(
            [setupFailure, ...cleanupFailures],
            "Production test setup and cleanup failed",
          );
        }
      }
    }
  });

  afterAll(async () => {
    const cleanupFailures = await cleanupTestResources();
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, "Production test cleanup failed");
    }
  });

  it.each([
    ["missing", MISSING_CHAT_ID],
    ["hidden by RLS for another user", RLS_HIDDEN_CHAT_ID],
  ])("returns HTTP 404 from Next when the chat is %s", async (_scenario, chatId) => {
    const response = await fetch(`${baseUrl}/chat/${chatId}`, {
      headers: { Cookie: sessionCookie() },
      redirect: "manual",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(postgrestChatRequests).toContainEqual({
      authorization: `Bearer ${ACCESS_TOKEN}`,
      chatIdFilter: `eq.${chatId}`,
      userIdFilter: `eq.${USER_ID}`,
    });
  });

  it("returns HTTP 200 for the owner with exactly one ownership lookup", async () => {
    const response = await fetch(`${baseUrl}/chat/${OWNER_CHAT_ID}`, {
      headers: { Cookie: sessionCookie() },
      redirect: "manual",
    });

    expect(response.status).toBe(200);
    expect(
      postgrestChatRequests.filter(
        ({ chatIdFilter }) => chatIdFilter === `eq.${OWNER_CHAT_ID}`,
      ),
    ).toEqual([
      {
        authorization: `Bearer ${ACCESS_TOKEN}`,
        chatIdFilter: `eq.${OWNER_CHAT_ID}`,
        userIdFilter: `eq.${USER_ID}`,
      },
    ]);
  });

  it("returns HTTP 200 for an owner HEAD request with one preflight", async () => {
    const response = await fetch(`${baseUrl}/chat/${HEAD_OWNER_CHAT_ID}`, {
      method: "HEAD",
      headers: { Cookie: sessionCookie() },
      redirect: "manual",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(
      postgrestChatRequests.filter(
        ({ chatIdFilter }) => chatIdFilter === `eq.${HEAD_OWNER_CHAT_ID}`,
      ),
    ).toHaveLength(1);
  });

  it("redirects an anonymous chat request to login", async () => {
    const response = await fetch(`${baseUrl}/chat/${MISSING_CHAT_ID}`, {
      redirect: "manual",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      `/auth/login?next=%2Fchat%2F${MISSING_CHAT_ID}`,
    );
  });

  it("keeps a database failure distinct from not found", async () => {
    const response = await fetch(`${baseUrl}/chat/${DATABASE_ERROR_CHAT_ID}`, {
      headers: { Cookie: sessionCookie() },
      redirect: "manual",
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });
});

/**
 * @jest-environment node
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const MISSING_CHAT_ID = "11111111-2222-4333-8444-555555555555";
const RLS_HIDDEN_CHAT_ID = "22222222-3333-4444-8555-666666666666";

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
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
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

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(fallback);
      resolve();
    });
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
    access_token: "test-access-token",
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
  let fakeSupabase: Server;
  let nextProcess: ChildProcessWithoutNullStreams;
  let baseUrl: string;
  let output = "";
  const postgrestChatIds: string[] = [];

  beforeAll(async () => {
    fakeSupabase = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/auth/v1/user") {
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
        postgrestChatIds.push(url.searchParams.get("id") ?? "");
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": "*/0",
        });
        response.end("[]");
        return;
      }
      json(response, 404, { message: "Unexpected fake Supabase request" });
    });
    const supabasePort = await listen(fakeSupabase);
    const nextPort = await reservePort();
    baseUrl = `http://127.0.0.1:${nextPort}`;

    const nextBin = require.resolve("next/dist/bin/next");
    const nextEnvironment = {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:9",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    output += await runNextBuild(nextBin, nextEnvironment);
    nextProcess = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(nextPort)], {
      cwd: process.cwd(),
      env: nextEnvironment,
      stdio: "pipe",
    });
    nextProcess.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    nextProcess.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    await waitForNext(baseUrl, () => output);
  });

  afterAll(async () => {
    await stopChild(nextProcess);
    await new Promise<void>((resolve, reject) => {
      fakeSupabase.close((error) => (error ? reject(error) : resolve()));
    });
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
    expect(postgrestChatIds).toContain(`eq.${chatId}`);
  });
});

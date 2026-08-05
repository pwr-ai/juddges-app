/**
 * @jest-environment node
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("@/lib/supabase/server");

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { GET } from "@/app/api/chats/[id]/messages/route";
import { updateSession } from "@/lib/supabase/middleware";
import { createClient } from "@/lib/supabase/server";

const CHAT_ID = "11111111-2222-4333-8444-555555555555";

describe("anonymous chat messages middleware-to-handler contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Auth session missing!" },
        }),
      },
    });
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Auth session missing!" },
        }),
      },
      from: jest.fn(),
    });
  });

  function mockAuthenticatedChatLookup({
    data,
    error = null,
    waitForAbort = false,
  }: {
    data: { id: string } | null;
    error?: { message: string } | null;
    waitForAbort?: boolean;
  }): void {
    let signal: AbortSignal | undefined;
    const maybeSingle = jest.fn(() => {
      if (!waitForAbort) return Promise.resolve({ data, error });
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () =>
            reject(
              signal?.reason ?? new DOMException("Aborted", "AbortError"),
            ),
          { once: true },
        );
      });
    });
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              abortSignal: jest.fn((querySignal: AbortSignal) => {
                signal = querySignal;
                return { maybeSingle };
              }),
            })),
          })),
        })),
      })),
    });
  }

  it("lets exactly GET /api/chats/[id]/messages reach its own 401 handler", async () => {
    const request = new NextRequest(
      `http://localhost:3000/api/chats/${CHAT_ID}/messages`,
    );

    const middlewareResponse = await updateSession(request);
    expect(middlewareResponse.status).toBe(200);
    expect(middlewareResponse.headers.get("location")).toBeNull();

    const handlerResponse = await GET(request, {
      params: Promise.resolve({ id: CHAT_ID }),
    });
    expect(handlerResponse.status).toBe(401);
  });

  it.each([
    "/api/chats",
    "/api/chats/not-a-uuid/messages",
    `/api/chats/${CHAT_ID}/export`,
    `/api/chats/${CHAT_ID}/messages/extra`,
    `/api/chats/${CHAT_ID}/messages-archive`,
    `/api/chats/${CHAT_ID}//messages`,
    "/api/chats/11111111-2222-4333-8444-555555555555%2Fextra/messages",
    "/api/chats/11111111-2222-4333-8444-555555555555%252Fextra/messages",
    "/api/chats/11111111-2222-4333-8444-555555555555%5Cextra/messages",
  ])("keeps neighboring path %s protected", async (path) => {
    const response = await updateSession(
      new NextRequest(`http://localhost:3000${path}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("returns 503 for an auth-service failure on an exact chat page", async () => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "authentication service unavailable", status: 503 },
        }),
      },
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/chat/not-a-uuid",
    `/chat/${CHAT_ID}/extra`,
    `/chat/${CHAT_ID}%2Fextra`,
  ])("does not open neighboring chat page %s on auth failure", async (path) => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "authentication service unavailable", status: 503 },
        }),
      },
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000${path}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("keeps non-GET methods on the exact path protected", async () => {
    const response = await updateSession(
      new NextRequest(`http://localhost:3000/api/chats/${CHAT_ID}/messages`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("continues to the page when the authenticated user owns the chat", async () => {
    mockAuthenticatedChatLookup({ data: { id: CHAT_ID } });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(200);
  });

  it("returns an indistinguishable 404 before streaming for a hidden chat", async () => {
    mockAuthenticatedChatLookup({ data: null });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/__chat-not-found",
    );
  });

  it("keeps middleware database failures distinct from 404", async () => {
    mockAuthenticatedChatLookup({
      data: null,
      error: { message: "database unavailable" },
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(503);
  });

  it("returns 504 when the middleware chat lookup times out", async () => {
    jest.useFakeTimers();
    mockAuthenticatedChatLookup({ data: null, waitForAbort: true });

    const responsePromise = updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );
    await jest.runAllTimersAsync();

    await expect(responsePromise).resolves.toMatchObject({ status: 504 });
  });
});

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
const TRUSTED_CHAT_HEADER = "x-juddges-owned-chat-id";
const ROTATED_COOKIE = "sb-test-auth-token";

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
    rotateCookie = false,
  }: {
    data: { id: string } | null;
    error?: { message: string } | null;
    waitForAbort?: boolean;
    rotateCookie?: boolean;
  }) {
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
    const from = jest.fn(() => ({
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
      }));
    (createServerClient as jest.Mock).mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (cookies: Array<{
              name: string;
              value: string;
              options?: { path?: string; httpOnly?: boolean };
            }>) => void;
          };
        },
      ) => ({
        auth: {
          getUser: jest.fn(async () => {
            if (rotateCookie) {
              options.cookies.setAll([
                {
                  name: ROTATED_COOKIE,
                  value: "rotated-session",
                  options: { path: "/", httpOnly: true },
                },
              ]);
            }
            return {
              data: {
                user: { id: "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5" },
              },
              error: null,
            };
          }),
        },
        from,
      }),
    );

    return { from, maybeSingle };
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

  it("accepts an uppercase UUID without relaxing the literal API path", async () => {
    const response = await updateSession(
      new NextRequest(
        `http://localhost:3000/api/chats/${CHAT_ID.toUpperCase()}/messages`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/api/chats",
    "/api/chats/not-a-uuid/messages",
    "/api/chats/11111111-2222-3333-4444-555555555555/messages",
    "/api/chats/11111111-2222-9333-8444-555555555555/messages",
    "/api/chats/11111111-2222-4333-7444-555555555555/messages",
    `/API/chats/${CHAT_ID}/messages`,
    `/api/CHATS/${CHAT_ID}/messages`,
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
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_expired",
  ])("treats auth code %s as an anonymous chat request", async (code) => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { code, message: "opaque auth error" },
        }),
      },
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
  });

  it("does not let fallback text hide an unexpected auth error code", async () => {
    (createServerClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: {
            code: "auth_service_unavailable",
            message: "refresh_token_not_found while contacting auth service",
          },
        }),
      },
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(503);
  });

  it.each([
    "/chat/not-a-uuid",
    "/chat/11111111-2222-3333-4444-555555555555",
    "/chat/11111111-2222-9333-8444-555555555555",
    "/chat/11111111-2222-4333-7444-555555555555",
    `/CHAT/${CHAT_ID}`,
    `/Chat/${CHAT_ID}`,
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
    const { from } = mockAuthenticatedChatLookup({ data: { id: CHAT_ID } });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`, {
        headers: { [TRUSTED_CHAT_HEADER]: "spoofed-chat-id" },
      }),
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(
      response.headers.get(`x-middleware-request-${TRUSTED_CHAT_HEADER}`),
    ).toBe(CHAT_ID);
  });

  it("preflights an authenticated HEAD request as the owner", async () => {
    const { from } = mockAuthenticatedChatLookup({ data: { id: CHAT_ID } });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`, {
        method: "HEAD",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(
      response.headers.get(`x-middleware-request-${TRUSTED_CHAT_HEADER}`),
    ).toBe(CHAT_ID);
  });

  it("returns an indistinguishable 404 before streaming for a hidden chat", async () => {
    mockAuthenticatedChatLookup({ data: null });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`, {
        headers: { [TRUSTED_CHAT_HEADER]: CHAT_ID },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/__chat-not-found",
    );
  });

  it("preserves a rotated session cookie on the early 404 response", async () => {
    mockAuthenticatedChatLookup({ data: null, rotateCookie: true });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(404);
    expect(response.cookies.get(ROTATED_COOKIE)?.value).toBe("rotated-session");
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

  it("preserves a rotated session cookie on the early 503 response", async () => {
    mockAuthenticatedChatLookup({
      data: null,
      error: { message: "database unavailable" },
      rotateCookie: true,
    });

    const response = await updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );

    expect(response.status).toBe(503);
    expect(response.cookies.get(ROTATED_COOKIE)?.value).toBe("rotated-session");
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

  it("preserves a rotated session cookie on the early 504 response", async () => {
    jest.useFakeTimers();
    mockAuthenticatedChatLookup({
      data: null,
      waitForAbort: true,
      rotateCookie: true,
    });

    const responsePromise = updateSession(
      new NextRequest(`http://localhost:3000/chat/${CHAT_ID}`),
    );
    await jest.runAllTimersAsync();

    const response = await responsePromise;
    expect(response.status).toBe(504);
    expect(response.cookies.get(ROTATED_COOKIE)?.value).toBe("rotated-session");
  });
});

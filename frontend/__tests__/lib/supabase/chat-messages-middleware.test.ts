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
    `/api/chats/${CHAT_ID}/export`,
    `/api/chats/${CHAT_ID}/messages/extra`,
    `/api/chats/${CHAT_ID}/messages-archive`,
  ])("keeps neighboring path %s protected", async (path) => {
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
});

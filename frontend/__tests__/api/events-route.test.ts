/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

const mockGetSession = jest.fn(async () => ({ data: { session: null } }));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getSession: mockGetSession },
  })),
}));

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { POST } from "@/app/api/events/route";

function makeRequest(
  body: unknown,
  options?: { cookie?: string }
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options?.cookie) {
    headers["Cookie"] = options.cookie;
  }
  return new NextRequest("http://localhost:3000/api/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

const validBody = {
  events: [{ event_name: "judgment_viewed", properties: { document_id: "d1" } }],
  session_id: "tab-1",
  surface: "web",
};

describe("POST /api/events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  it("forwards the batch to the backend with the API key and returns 204", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202 });

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/api/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(validBody),
      })
    );
  });

  it("forwards the Supabase bearer token when a session exists", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "jwt-token" } },
    } as never);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202 });

    await POST(makeRequest(validBody));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer jwt-token");
  });

  it.each(["auth_signed_out", "auth_signed_in", "auth_signed_up"])(
    "rejects %s from the browser with 400 without calling the backend",
    async (eventName) => {
      const response = await POST(
        makeRequest({ events: [{ event_name: eventName, properties: {} }] })
      );

      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it("rejects non-string event_name with 400", async () => {
    const response = await POST(
      makeRequest({ events: [{ event_name: 42, properties: {} }] })
    );
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty events array with 400", async () => {
    const response = await POST(makeRequest({ events: [] }));
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/events", {
        method: "POST",
        body: "not-json{",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the guest_session_id cookie to the backend", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202 });

    await POST(makeRequest(validBody, { cookie: "guest_session_id=guest-abc" }));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Cookie).toBe("guest_session_id=guest-abc");
  });

  it("propagates backend error status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "unknown event_name" }),
    });

    const response = await POST(makeRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("unknown event_name");
  });

  it("returns 503 on fetch transport errors", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await POST(makeRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Failed to connect to backend service");
  });
});

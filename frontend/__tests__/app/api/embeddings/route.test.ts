/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/server");

import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/embeddings/route";
import { createClient } from "@/lib/supabase/server";

global.fetch = jest.fn();

function mockUser(options: { admin?: boolean; token?: string; authenticated?: boolean } = {}) {
  const { admin = false, token = "verified-jwt", authenticated = true } = options;
  const getUser = jest.fn().mockResolvedValue({
    data: {
      user: authenticated
        ? { id: "user-1", app_metadata: { is_admin: admin } }
        : null,
    },
    error: null,
  });
  const getSession = jest.fn().mockResolvedValue({
    data: { session: authenticated && token ? { access_token: token } : null },
    error: null,
  });
  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser,
      getSession,
    },
  });
  return { getUser, getSession };
}

describe("embeddings BFF", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8002";
    process.env.BACKEND_API_KEY = "service-key";
  });

  it("returns 401 without a verified user and does not call upstream", async () => {
    mockUser({ authenticated: false });

    const response = await GET(
      new NextRequest("http://localhost/api/embeddings?endpoint=models"),
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "unknown",
    "../models",
    "models%2F..%2Ftest",
    "models/active/extra",
    "constructor",
    "toString",
    "__proto__",
  ])(
    "rejects unsafe GET endpoint %s without calling upstream",
    async (endpoint) => {
      mockUser();
      const response = await GET(
        new NextRequest(
          `http://localhost/api/embeddings?endpoint=${encodeURIComponent(endpoint)}`,
        ),
      );

      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["unknown", "../test", "test/../../models", "constructor", "toString"])(
    "rejects unsafe POST action %s without calling upstream",
    async (action) => {
      mockUser({ admin: true });
      const response = await POST(
        new NextRequest(
          `http://localhost/api/embeddings?action=${encodeURIComponent(action)}`,
          { method: "POST", body: JSON.stringify({}) },
        ),
      );

      expect(response.status).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("forwards a verified Bearer token and preserves a 429 response", async () => {
    const { getUser } = mockUser();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Slow down" }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "10",
        },
      }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/embeddings?endpoint=models/active"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("10");
    await expect(response.json()).resolves.toEqual({ detail: "Slow down" });
    expect(getUser).toHaveBeenCalledWith("verified-jwt");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8002/embeddings/models/active",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer verified-jwt",
          "X-API-Key": "service-key",
        }),
      }),
    );
  });

  it("rejects set-active for a non-admin without calling upstream", async () => {
    mockUser();

    const response = await POST(
      new NextRequest("http://localhost/api/embeddings?action=set-active", {
        method: "POST",
        body: JSON.stringify({ model_id: "tei/bge-m3" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows an admin to set the active model", async () => {
    mockUser({ admin: true, token: "admin-jwt" });
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ model_id: "tei/bge-m3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/embeddings?action=set-active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model_id: "tei/bge-m3" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8002/embeddings/models/active",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-jwt" }),
      }),
    );
  });

  it("returns 503 when the service key is missing", async () => {
    mockUser();
    delete process.env.BACKEND_API_KEY;

    const response = await GET(
      new NextRequest("http://localhost/api/embeddings?endpoint=models"),
    );

    expect(response.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when upstream times out", async () => {
    mockUser();
    (global.fetch as jest.Mock).mockRejectedValue(
      new DOMException("timed out", "TimeoutError"),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/embeddings?action=test", {
        method: "POST",
        body: JSON.stringify({ text: "test" }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("preserves an upstream 503 body", async () => {
    mockUser();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Provider unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/embeddings?action=test", {
        method: "POST",
        body: JSON.stringify({ text: "test" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: "Provider unavailable",
    });
  });
});

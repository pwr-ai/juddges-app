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
import { GET, DELETE } from "@/app/api/search/analytics/history/route";

describe("GET /api/search/analytics/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it("returns 401 for anonymous callers", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/analytics/history")
    );
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards days/limit and the bearer token to the backend", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ query: "vat fraud", hit_count: 5, created_at: "2026-05-13T00:00:00Z" }],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/search/analytics/history?days=7&limit=10"
      )
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/api/search/analytics/history?days=7&limit=10",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          Authorization: "Bearer user-jwt-123",
        }),
      })
    );
  });

  it("propagates backend error status and detail", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Rate limit exceeded" }),
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/analytics/history")
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Rate limit exceeded");
  });

  it("returns 503 on fetch transport errors", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/analytics/history")
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Failed to connect to backend service");
  });
});

describe("DELETE /api/search/analytics/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it("returns 401 for anonymous callers", async () => {
    const response = await DELETE();
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("issues a DELETE to the backend with the bearer token", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted: 5 }),
    });

    const response = await DELETE();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ deleted: 5 });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/api/search/analytics/history",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer user-jwt-123",
        }),
      })
    );
  });

  it("propagates backend error status and detail", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Internal error" }),
    });

    const response = await DELETE();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Internal error");
  });

  it("returns 503 on fetch transport errors", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await DELETE();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Failed to connect to backend service");
  });
});

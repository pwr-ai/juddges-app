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
import { GET } from "@/app/api/search/autocomplete/route";

describe("GET /api/search/autocomplete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it("forwards query params to backend autocomplete endpoint", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hits: [{ id: "doc-1" }], query: "vat" }),
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/search/autocomplete?q=vat&limit=5&filters=language%20%3D%20'pl'"
      )
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/api/search/autocomplete?q=vat&limit=5&filters=language+%3D+%27pl%27",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("propagates backend error status and detail", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Meilisearch is not configured" }),
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/autocomplete?q=vat")
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Meilisearch is not configured");
  });

  it("forwards Supabase access token as Authorization: Bearer when signed in", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "user-jwt-123" } as never },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ topic_hits: [], query: "vat" }),
    });

    await GET(
      new NextRequest("http://localhost:3000/api/search/autocomplete?q=vat")
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-jwt-123",
        }),
      })
    );
  });

  it("omits Authorization header for anonymous requests", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ topic_hits: [], query: "vat" }),
    });

    await GET(
      new NextRequest("http://localhost:3000/api/search/autocomplete?q=vat")
    );

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("returns 503 on fetch transport errors", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await GET(
      new NextRequest("http://localhost:3000/api/search/autocomplete?q=vat")
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("Failed to connect to backend service");
  });
});

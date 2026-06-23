/**
 * @jest-environment node
 */

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { POST } from "@/app/api/topic-modeling/analyze/route";

describe("POST /api/topic-modeling/analyze", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  function buildRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost:3000/api/topic-modeling/analyze", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("forwards the body and API key to the backend", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ topics: [], statistics: {} }),
    });

    const payload = { sample_size: 200, num_topics: 8 };
    const response = await POST(buildRequest(payload));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/topic-modeling/analyze",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it("surfaces the backend error detail and status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Rate limit exceeded" }),
    });

    const response = await POST(buildRequest({}));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe("Rate limit exceeded");
  });

  it("returns 503 when the backend is unreachable", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await POST(buildRequest({}));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Failed to connect to backend service");
  });
});

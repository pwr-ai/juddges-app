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

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { POST } from "@/app/api/search/topic-click/route";

describe("POST /api/search/topic-click", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  it("forwards POST body to backend topic-click endpoint with API key header", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 204,
    });

    const payload = { topic_id: "drug_trafficking", query: "narko", jurisdiction: "pl" };

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search/topic-click", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend:8000/api/search/topic-click",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-api-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      })
    );
  });

  it("propagates backend error status and detail", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Invalid topic_id" }),
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search/topic-click", {
        method: "POST",
        body: JSON.stringify({ topic_id: "", query: "narko", jurisdiction: null }),
        headers: { "Content-Type": "application/json" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toBe("Invalid topic_id");
  });

  it("returns 503 on fetch transport errors", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    const response = await POST(
      new NextRequest("http://localhost:3000/api/search/topic-click", {
        method: "POST",
        body: JSON.stringify({ topic_id: "fraud", query: "fraud", jurisdiction: null }),
        headers: { "Content-Type": "application/json" },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("Failed to connect to backend service");
  });
});

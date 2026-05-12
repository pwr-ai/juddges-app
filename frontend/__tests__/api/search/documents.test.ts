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

import { NextRequest } from "next/server";

describe("GET /api/search/documents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend:8000";
    process.env.BACKEND_API_KEY = "test-api-key";
  });

  it("forwards facets[] and facet_query to the backend", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ documents: [], facetDistribution: {} }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    try {
      const url = new URL("http://localhost/api/search/documents");
      url.searchParams.append("q", "");
      url.searchParams.append("facets", "base_appeal_outcome");
      url.searchParams.append("facets", "base_keywords");
      url.searchParams.set("facet_query", "frau");

      const { GET } = await import("@/app/api/search/documents/route");
      const res = await GET(new NextRequest(url));
      expect(res.status).toBe(200);

      const calledUrl = String(fetchMock.mock.calls[0][0]);
      expect(calledUrl).toContain("facets=base_appeal_outcome");
      expect(calledUrl).toContain("facets=base_keywords");
      expect(calledUrl).toContain("facet_query=frau");
    } finally {
      fetchMock.mockRestore();
    }
  });
});

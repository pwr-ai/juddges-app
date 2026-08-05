/** @jest-environment node */

import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  })),
}));
jest.mock("@/lib/server/schema-detail", () => {
  const actual = jest.requireActual("@/lib/server/schema-detail");
  return { ...actual, fetchSchemaDetail: jest.fn() };
});

import { DELETE, GET, HEAD, PATCH, POST, PUT } from "@/app/api/schemas/[id]/route";
import {
  SchemaDetailNotFoundError,
  SchemaDetailUpstreamError,
  fetchSchemaDetail,
} from "@/lib/server/schema-detail";

const mockFetchSchemaDetail = jest.mocked(fetchSchemaDetail);

const ID = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: ID }) };
const visibleSchema = {
  id: ID,
  name: "Visible schema",
  description: null,
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published" as const,
  is_verified: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
};

describe("GET /api/schemas/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    mockFetchSchemaDetail.mockResolvedValue(visibleSchema);
  });

  it("returns the visible schema without caching", async () => {
    const response = await GET(new NextRequest(`http://localhost/api/schemas/${ID}`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ id: ID });
    expect(mockFetchSchemaDetail).toHaveBeenCalledWith(
      ID,
      "verified-token",
      expect.any(AbortSignal)
    );
  });

  it.each([
    [null, null, 401],
    [null, { status: 401, message: "Auth session missing!" }, 401],
    [null, { status: 503, message: "auth unavailable" }, 503],
  ])("classifies authentication failures", async (user, error, status) => {
    mockGetUser.mockResolvedValue({ data: { user }, error });
    const response = await GET(new NextRequest(`http://localhost/api/schemas/${ID}`), context);
    expect(response.status).toBe(status);
  });

  it("returns 401 when the verified session has no bearer token", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    const response = await GET(new NextRequest(`http://localhost/api/schemas/${ID}`), context);
    expect(response.status).toBe(401);
  });

  it("returns 503 when the local session service throws", async () => {
    mockGetSession.mockRejectedValue(new TypeError("auth transport failed"));
    const response = await GET(
      new NextRequest(`http://localhost/api/schemas/${ID}`),
      context
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "DATABASE_UNAVAILABLE" });
  });

  it("returns the same 404 for invalid, missing, and RLS-hidden IDs", async () => {
    const invalid = await GET(
      new NextRequest("http://localhost/api/schemas/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(invalid.status).toBe(404);

    mockFetchSchemaDetail.mockRejectedValue(new SchemaDetailNotFoundError());
    const hidden = await GET(new NextRequest(`http://localhost/api/schemas/${ID}`), context);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toMatchObject({ code: "SCHEMA_NOT_FOUND" });
  });

  it.each([401, 403, 500, 502, 503, 504])(
    "preserves service status %i",
    async (status) => {
      mockFetchSchemaDetail.mockRejectedValue(
        new SchemaDetailUpstreamError("schema service failed", status, "upstream")
      );
      const response = await GET(new NextRequest(`http://localhost/api/schemas/${ID}`), context);
      expect(response.status).toBe(status);
    }
  );

  it("implements HEAD with the GET status and no body", async () => {
    mockFetchSchemaDetail.mockRejectedValue(new SchemaDetailNotFoundError());
    const response = await HEAD(
      new NextRequest(`http://localhost/api/schemas/${ID}`, { method: "HEAD" }),
      context
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it.each([POST, PUT, PATCH, DELETE])(
    "returns an exact 405 contract for unsupported methods",
    async (handler) => {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
  );
});

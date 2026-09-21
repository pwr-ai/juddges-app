/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser, getSession: mockGetSession } })),
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })) },
}));

global.fetch = jest.fn();

import { POST } from "@/app/api/compare/facets/route";

const body = { filters: { appellant: ["offender"] }, fields: ["appellant"] };

function req() {
  return new NextRequest("http://localhost:3026/api/compare/facets", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/compare/facets (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("rejects anonymous callers before touching the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the body with API key and bearer, and returns the backend body unchanged", async () => {
    const upstream = { totals: { PL: 1, UK: 2 } };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/compare/facets");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(init.headers["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("passes an upstream 400 UNKNOWN_FIELD detail through untouched", async () => {
    const detail = { error: "Unknown Field", code: "UNKNOWN_FIELD", fields: ["bogus"], message: "…" };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail }), { status: 400, headers: { "content-type": "application/json" } }),
    );
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail });
  });
});

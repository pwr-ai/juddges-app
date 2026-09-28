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

import { GET } from "@/app/api/compare/pairs/[pairId]/route";

function req() {
  return new NextRequest("http://localhost:3026/api/compare/pairs/p9");
}

describe("GET /api/compare/pairs/[pairId] (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p9" }) });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches the pair from the backend and returns the body unchanged", async () => {
    const upstream = { pair: { id: "p9", name: "n", pl_collection_id: "a", uk_collection_id: "b" }, totals: { PL: 1, UK: 2 } };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p9" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/compare/pairs/p9");
  });

  it("passes the upstream 404 status through", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: "Collection pair not found" }), { status: 404 }),
    );
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p9" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Collection pair not found" });
  });
});

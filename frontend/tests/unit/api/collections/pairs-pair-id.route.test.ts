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

import { DELETE, GET } from "@/app/api/collections/pairs/[pairId]/route";

function req(method: "GET" | "DELETE" = "GET") {
  return new NextRequest("http://localhost:3026/api/collections/pairs/p1", { method });
}

describe("/api/collections/pairs/[pairId] (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("GET 401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p1" }) });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("GET fetches one pair unchanged", async () => {
    const upstream = { id: "p1", user_id: "u1", name: "n", filters: {}, text_query: null, created_at: "t", updated_at: "t", sides: [] };
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("http://backend.test/collections/pairs/p1");
  });

  it("GET passes an upstream 404 through", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ detail: "Collection pair not found" }), { status: 404 }));
    const res = await GET(req(), { params: Promise.resolve({ pairId: "p1" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Collection pair not found" });
  });

  it("DELETE forwards a 204 as-is", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ pairId: "p1" }) });
    expect(res.status).toBe(204);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/collections/pairs/p1");
    expect(init.method).toBe("DELETE");
  });
});

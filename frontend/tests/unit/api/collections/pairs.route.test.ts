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

import { GET } from "@/app/api/collections/pairs/route";

function req() {
  return new NextRequest("http://localhost:3026/api/collections/pairs");
}

describe("GET /api/collections/pairs (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lists the caller's pairs unchanged", async () => {
    const upstream = [{ id: "p1", user_id: "u1", name: "n", filters: {}, text_query: null, created_at: "t", updated_at: "t", sides: [] }];
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(upstream), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(upstream);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/collections/pairs");
    expect(init.headers["X-API-Key"]).toBe("k");
    expect(init.headers.Authorization).toBe("Bearer jwt");
  });
});

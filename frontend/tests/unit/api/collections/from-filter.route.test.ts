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
  logger: { error: jest.fn(), info: jest.fn() },
  default: { child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })) },
}));

global.fetch = jest.fn();

import { POST } from "@/app/api/collections/from-filter/route";

const body = { name: "fraud PL 2015–2024", filters: { jurisdiction: ["PL"] }, text_query: null };

function req() {
  return new NextRequest("http://localhost:3026/api/collections/from-filter", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/collections/from-filter (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req())).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards body with bearer + api key and returns the 201 body unchanged", async () => {
    const upstream = { collections: [{ jurisdiction: null, collection: { id: "c1" }, added_count: 3 }], total_matched: 3, pair_id: null };
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 201, headers: { "content-type": "application/json" } }));
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(upstream);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/collections/from-filter");
    expect(init.headers.Authorization).toBe("Bearer jwt");
    expect(init.headers["X-API-Key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("passes a FastAPI 413 detail through untouched (the client unwraps it)", async () => {
    const detail = { error: "Too Many Documents", code: "FILTER_TOO_LARGE", total: 7321, cap: 5000, jurisdiction: null, message: "…" };
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 413, headers: { "content-type": "application/json" } }));
    const res = await POST(req());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail });
  });
});

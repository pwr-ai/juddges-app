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

import { POST } from "@/app/api/compare/export/route";

const body = { filters: {} };

function req() {
  return new NextRequest("http://localhost:3026/api/compare/export", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/compare/export (via proxyToBackend)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = "http://backend.test";
    process.env.BACKEND_API_KEY = "k";
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  });

  it("401s without a session and never calls the backend", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("streams the CSV bytes and forwards content-type, content-disposition, x-rows-count", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response("﻿field,value\n", {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="compare_2026-09-21.csv"',
          "x-rows-count": "1",
        },
      }),
    );
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("compare_2026-09-21.csv");
    expect(res.headers.get("x-rows-count")).toBe("1");
    expect(await res.text()).toContain("field,value");
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/compare/export");
    expect(JSON.parse(init.body)).toEqual(body);
  });
});

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

jest.mock("@/lib/supabase/server");

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/extractions/[id]/results/route";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const JOB_ID = "22222222-3333-4444-8555-666666666666";

function mockAuth(userId: string | null, accessToken: string | null = "test-access-token") {
  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("not authed"),
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: accessToken ? { access_token: accessToken } : null },
        error: null,
      }),
    },
  });
}

function call(query = "", id = JOB_ID) {
  return GET(
    new NextRequest(`http://localhost:3000/api/extractions/${id}/results${query}`),
    { params: Promise.resolve({ id }) }
  );
}

const PAGE = {
  job_id: JOB_ID,
  offset: 20,
  limit: 20,
  total: 6150,
  filtered_total: 6000,
  counts: { completed: 6000, failed: 150, other: 0 },
  results: [],
};

describe("GET /api/extractions/[id]/results", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "test-api-key";
    process.env.API_BASE_URL = "http://localhost:8004";
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockAuth(null);

    const response = await call();

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session access token", async () => {
    mockAuth(USER_ID, null);

    const response = await call();

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-UUID job id", "?offset=0", "not-a-uuid"],
    ["a negative offset", "?offset=-1", JOB_ID],
    ["a non-numeric offset", "?offset=abc", JOB_ID],
    ["a zero limit", "?limit=0", JOB_ID],
    ["a limit above 200", "?limit=201", JOB_ID],
    ["an unknown status", "?status=pending", JOB_ID],
  ])("returns 400 for %s", async (_label, query, id) => {
    mockAuth(USER_ID);

    const response = await call(query, id);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies offset, limit and status to the backend with auth headers", async () => {
    mockAuth(USER_ID);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => PAGE,
    });

    const response = await call("?offset=20&limit=20&status=failed");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PAGE);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      `http://localhost:8004/extractions/${JOB_ID}/results?offset=20&limit=20&status=failed`
    );
    expect(init.headers).toEqual(
      expect.objectContaining({
        "X-API-Key": "test-api-key",
        Authorization: "Bearer test-access-token",
        "X-RateLimit-Identity": expect.any(String),
      })
    );
    expect(init.signal).toBeDefined();
  });

  it("applies the first-page defaults and omits status when not given", async () => {
    mockAuth(USER_ID);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => PAGE,
    });

    await call();

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      `http://localhost:8004/extractions/${JOB_ID}/results?offset=0&limit=20`
    );
  });

  it.each([404, 422, 503])("preserves backend status %s", async (status) => {
    mockAuth(USER_ID);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      text: async () => JSON.stringify({ detail: `upstream ${status}` }),
    });

    const response = await call();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(
      expect.objectContaining({ message: `upstream ${status}` })
    );
  });

  it("returns 504 when the backend times out", async () => {
    mockAuth(USER_ID);
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    (global.fetch as jest.Mock).mockRejectedValue(timeout);

    const response = await call();

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual(
      expect.objectContaining({ code: "EXTRACTION_TIMEOUT" })
    );
  });

  it("returns 503 when the backend is unreachable", async () => {
    mockAuth(USER_ID);
    (global.fetch as jest.Mock).mockRejectedValue(new Error("ECONNREFUSED"));

    const response = await call();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(
      expect.objectContaining({ code: "EXTRACTION_UNAVAILABLE" })
    );
  });

  it("returns 502 when the backend body is not JSON", async () => {
    mockAuth(USER_ID);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    });

    const response = await call();

    expect(response.status).toBe(502);
  });
});

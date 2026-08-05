/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

const mockUpdateSessionWithAuth = jest.fn();

jest.mock("@/lib/supabase/middleware", () => ({
  updateSessionWithAuth: (...args: unknown[]) =>
    mockUpdateSessionWithAuth(...args),
}));

global.fetch = jest.fn();

import { config, middleware } from "@/middleware";

const JOB_ID = "22222222-3333-4444-8555-666666666666";

function request(
  path = `/extractions/${JOB_ID}`,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(`http://localhost${path}`, init);
}

describe("extraction detail middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "signing-secret";
    process.env.API_BASE_URL = "http://backend.test";
    mockUpdateSessionWithAuth.mockImplementation((incoming: NextRequest) => ({
      response: NextResponse.next({ request: incoming }),
      userId: "user-1",
      accessToken: "access-token",
      request: incoming,
    }));
  });

  it("matches the extraction subtree even for asset-like identifiers", () => {
    expect(config.matcher).toContain("/extractions/:path*");
  });

  it("returns a real 404 for invalid identifiers without an upstream call", async () => {
    const response = await middleware(request("/extractions/attack.txt"));

    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([404, 422, 500, 503])(
    "preserves upstream status %s at the page boundary",
    async (status) => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status });

      const response = await middleware(request());

      expect(response.status).toBe(status);
      const body = await response.text();
      if (status === 404) expect(body).toMatch(/not found/i);
      else expect(body).toMatch(/unavailable|failed|invalid/i);
    }
  );

  it("hides an upstream access denial behind the same 404", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });

    expect((await middleware(request())).status).toBe(404);
  });

  it("returns 502 for a malformed successful payload", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });

    expect((await middleware(request())).status).toBe(502);
  });

  it("returns 504 for an upstream timeout", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    (global.fetch as jest.Mock).mockRejectedValue(timeout);

    expect((await middleware(request())).status).toBe(504);
  });

  it("keeps HEAD status parity without returning an HTML body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const response = await middleware(request(undefined, { method: "HEAD" }));

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  it("returns an exact JSON 401 for anonymous detail BFF reads", async () => {
    mockUpdateSessionWithAuth.mockImplementation((incoming: NextRequest) => ({
      response: NextResponse.next({ request: incoming }),
      userId: null,
      accessToken: null,
      request: incoming,
    }));

    const response = await middleware(
      request(`/api/extractions?job_id=${JOB_ID}`)
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
  });

  it("preserves refreshed session cookies on extraction failures", async () => {
    mockUpdateSessionWithAuth.mockImplementation((incoming: NextRequest) => {
      const sessionResponse = NextResponse.next({ request: incoming });
      sessionResponse.cookies.set("sb-refreshed", "new-token");
      return {
        response: sessionResponse,
        userId: "user-1",
        accessToken: "access-token",
        request: incoming,
      };
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const response = await middleware(request());

    expect(response.cookies.get("sb-refreshed")?.value).toBe("new-token");
  });

  it("rejects unsupported page methods with an explicit Allow header", async () => {
    const response = await middleware(request(undefined, { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("strips spoofed transport headers and injects a signed snapshot", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: JOB_ID, status: "SUCCESS", results: [] }),
    });

    const response = await middleware(
      request(undefined, {
        headers: {
          "x-juddges-extraction-snapshot": "spoofed",
          "x-juddges-extraction-snapshot-signature": "forged",
          "x-juddges-extraction-verified-user": "attacker",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(
      response.headers.get(
        "x-middleware-request-x-juddges-extraction-snapshot"
      )
    ).not.toBe("spoofed");
    expect(
      response.headers.get(
        "x-middleware-request-x-juddges-extraction-snapshot-signature"
      )
    ).toBeTruthy();
    expect(
      response.headers.get(
        "x-middleware-request-x-juddges-extraction-verified-user"
      )
    ).toBe("user-1");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

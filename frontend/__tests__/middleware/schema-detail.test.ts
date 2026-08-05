/** @jest-environment node */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/supabase/middleware", () => ({
  updateSessionWithAuth: jest.fn(),
}));

import { middleware } from "@/middleware";
import { updateSessionWithAuth } from "@/lib/supabase/middleware";
import type { SessionUpdate } from "@/lib/supabase/middleware";
import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
} from "@/lib/schemas/detail-transport";

const mockUpdateSessionWithAuth = jest.mocked(updateSessionWithAuth);

const ID = "abcdef01-1234-4abc-8def-1234567890ab";
const schema = {
  id: ID,
  name: "Visible schema",
  description: null,
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published",
  is_verified: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
};

function sessionResult(request: NextRequest, authenticated = true): SessionUpdate {
  const response = NextResponse.next({ request });
  response.cookies.set("sb-refresh", "rotated", { path: "/" });
  return {
    response,
    request,
    userId: authenticated ? "owner-1" : null,
    accessToken: authenticated ? "verified-token" : null,
    authFailure: authenticated ? null : "unauthenticated",
  };
}

describe("schema detail middleware preflight", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.BACKEND_API_KEY = "snapshot-secret";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify([schema]), { status: 200 })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("preflights once, replaces spoofed proof headers, and preserves refresh cookies", async () => {
    const request = new NextRequest(`http://localhost/schemas/${ID}`, {
      headers: {
        [SCHEMA_SNAPSHOT_HEADER]: "forged",
        [SCHEMA_SNAPSHOT_SIGNATURE_HEADER]: "forged",
        [SCHEMA_SNAPSHOT_USER_HEADER]: "attacker",
      },
    });
    mockUpdateSessionWithAuth.mockResolvedValue(sessionResult(request));

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/rest/v1/extraction_schemas?"),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/rest/v1/user_profiles?"),
      expect.any(Object)
    );
    expect(response.cookies.get("sb-refresh")?.value).toBe("rotated");
    expect(response.headers.get("x-middleware-request-x-juddges-schema-snapshot")).not.toBe(
      "forged"
    );
    expect(
      response.headers.get("x-middleware-request-x-juddges-schema-snapshot-signature")
    ).not.toBe("forged");
    expect(response.headers.get("x-middleware-request-x-juddges-schema-snapshot-user")).toBe(
      "owner-1"
    );
  });

  it.each([
    [[], 404],
    [{ status: 500 }, 500],
    [{ status: 503 }, 503],
  ])("returns a real page status and preserves refresh cookies", async (upstream, status) => {
    const request = new NextRequest(`http://localhost/schemas/${ID}`);
    mockUpdateSessionWithAuth.mockResolvedValue(sessionResult(request));
    global.fetch = jest.fn().mockResolvedValue(
      Array.isArray(upstream)
        ? new Response(JSON.stringify(upstream), { status: 200 })
        : new Response("failed", upstream)
    );
    const response = await middleware(request);
    expect(response.status).toBe(status);
    expect(response.cookies.get("sb-refresh")?.value).toBe("rotated");
    if (status === 404) {
      expect(response.headers.get("x-middleware-rewrite")).toContain(
        "/__schema-not-found"
      );
    } else {
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(
        response.headers.get("x-middleware-request-x-juddges-schema-failure-status")
      ).toBe(String(status));
    }
  });

  it("returns 405 for unsupported page methods", async () => {
    const request = new NextRequest(`http://localhost/schemas/${ID}`, { method: "POST" });
    mockUpdateSessionWithAuth.mockResolvedValue(sessionResult(request));
    const response = await middleware(request);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects encoded aliases before querying the schema service", async () => {
    const encoded = `%61${ID.slice(1)}`;
    const request = new NextRequest(`http://localhost/schemas/${encoded}`);
    mockUpdateSessionWithAuth.mockResolvedValue(sessionResult(request));
    const response = await middleware(request);
    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes exact anonymous API reads to the handler without opening lookalikes", async () => {
    const exact = new NextRequest(`http://localhost/api/schemas/${ID}`);
    mockUpdateSessionWithAuth.mockResolvedValueOnce(sessionResult(exact, false));
    const exactResponse = await middleware(exact);
    expect(exactResponse.status).toBe(200);
    expect(exactResponse.headers.get("location")).toBeNull();

    const lookalike = new NextRequest(`http://localhost/api/schemas/${ID}/nested`);
    const redirect = NextResponse.redirect("http://localhost/auth/login");
    mockUpdateSessionWithAuth.mockResolvedValueOnce({
      ...sessionResult(lookalike, false),
      response: redirect,
    });
    const lookalikeResponse = await middleware(lookalike);
    expect(lookalikeResponse.status).toBe(307);
  });
});

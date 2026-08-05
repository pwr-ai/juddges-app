/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  })),
}));

global.fetch = jest.fn();

import {
  updateSession,
  updateSessionWithAuth,
} from "@/lib/supabase/middleware";

describe("Supabase middleware retired routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it("lets only the retired GraphQL route fall through to Next.js 404", async () => {
    const retiredRoute = await updateSession(
      new NextRequest("http://localhost/api/graphql", { method: "POST" })
    );
    const lookalikeRoute = await updateSession(
      new NextRequest("http://localhost/api/graphql/nested", { method: "POST" })
    );

    expect(retiredRoute.status).toBe(200);
    expect(retiredRoute.headers.get("location")).toBeNull();
    expect(lookalikeRoute.status).toBe(307);
    expect(lookalikeRoute.headers.get("location")).toBe(
      "http://localhost/auth/login?next=%2Fapi%2Fgraphql%2Fnested"
    );
  });

  it("rewrites an authenticated missing collection to an exact HTTP 404", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const response = await updateSession(
      new NextRequest(
        "http://localhost/collections/cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      )
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/__collection-not-found"
    );
  });

  it("returns 503 for an unexpected Supabase auth failure instead of redirecting", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        message: "authentication service unavailable",
        code: "unexpected_failure",
        status: 500,
      },
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1")
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["bad_jwt", 401],
    ["session_expired", 400],
    ["refresh_token_already_used", 400],
  ])(
    "redirects stale-session error %s through the normal sign-in lifecycle",
    async (code, status) => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthApiError",
          message: "stored credentials are no longer valid",
          code,
          status,
        },
      });

      const response = await updateSession(
        new NextRequest("http://localhost/collections/collection-1?tab=documents")
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/auth/login?next=%2Fcollections%2Fcollection-1%3Ftab%3Ddocuments"
      );
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it("keeps AuthRetryableFetchError on the retryable 503 path", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthRetryableFetchError",
        message: "network request failed",
        status: 0,
      },
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1")
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects when the session is cleared after a successful user lookup", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?next=%2Fcollections%2Fcollection-1"
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses the same 404 for an unexpected other-user collection payload", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "collection-1", user_id: "other-user" }),
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1")
    );

    expect(response.status).toBe(404);
  });

  it("rejects unsafe collection IDs as 404 without an upstream request", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/unsafe%20collection")
    );

    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500, 503])(
    "preserves upstream status %s at the HTTP response boundary",
    async (status) => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status });

      const response = await updateSession(
        new NextRequest("http://localhost/collections/collection-1")
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  );

  it("returns 504 for a collection preflight timeout", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    (global.fetch as jest.Mock).mockRejectedValue(timeout);

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1")
    );

    expect(response.status).toBe(504);
  });

  it("hydrates the owned collection in the downstream request after one read", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "collection-1",
        user_id: "user-1",
        name: "Hydrated",
        documents: [],
        document_count: 37,
      }),
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1", {
        headers: { "x-juddges-collection-snapshot": "spoofed" },
      })
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const snapshot = response.headers.get(
      "x-middleware-request-x-juddges-collection-snapshot"
    );
    expect(snapshot).toBeTruthy();
    expect(snapshot).not.toBe("spoofed");
  });

  it("preflights only the exact collection detail shape", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1/documents")
    );

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-page methods without a preflight read", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/collection-1", {
        method: "POST",
      })
    );

    expect(response.status).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("strips forged extraction proof headers before downstream handling", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
    });

    const result = await updateSessionWithAuth(
      new NextRequest("http://localhost/extractions/job.txt", {
        headers: {
          "x-juddges-extraction-snapshot": "spoofed",
          "x-juddges-extraction-snapshot-signature": "forged",
          "x-juddges-extraction-verified-user": "attacker",
        },
      })
    );

    expect(result.userId).toBe("user-1");
    expect(result.accessToken).toBe("access-token");
    expect(result.request.headers.get("x-juddges-extraction-snapshot")).toBeNull();
    expect(
      result.request.headers.get("x-juddges-extraction-snapshot-signature")
    ).toBeNull();
    expect(
      result.request.headers.get("x-juddges-extraction-verified-user")
    ).toBeNull();
  });
});

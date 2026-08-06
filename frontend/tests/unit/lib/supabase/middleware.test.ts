/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const EXTRACTION_ID = "22222222-3333-4444-8555-666666666666";

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
import { decodeCollectionSnapshot } from "@/lib/collections/detail-contract";

describe("Supabase middleware public route policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  it.each([
    ["GET", "/contact"],
    ["GET", "/legal/disclaimer"],
    ["GET", "/blog/published-slug"],
    ["GET", "/publications"],
    ["GET", "/use-cases/uk-judgments"],
    ["GET", "/offline"],
    ["HEAD", "/twitter-image"],
    ["GET", "/api/publications"],
    ["HEAD", "/api/blog/posts"],
    ["POST", "/api/contact"],
    ["POST", "/api/graphql"],
    ["GET", `/api/extractions?job_id=${EXTRACTION_ID}`],
    ["HEAD", `/api/extractions?job_id=${EXTRACTION_ID}`],
  ] as const)("passes through public %s %s", async (method, pathname) => {
    const response = await updateSession(
      new NextRequest(`http://localhost${pathname}`, { method }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    [
      "GET",
      "/search?q=vat&court=appeal",
      "http://localhost/auth/login?next=%2Fsearch%3Fq%3Dvat%26court%3Dappeal",
    ],
    [
      "GET",
      "/about-private?tab=team",
      "http://localhost/auth/login?next=%2Fabout-private%3Ftab%3Dteam",
    ],
    [
      "GET",
      "/blog/admin/draft-1",
      "http://localhost/auth/login?next=%2Fblog%2Fadmin%2Fdraft-1",
    ],
    [
      "GET",
      "/blog/admin/secret.txt",
      "http://localhost/auth/login?next=%2Fblog%2Fadmin%2Fsecret.txt",
    ],
    [
      "GET",
      "/publications/admin",
      "http://localhost/auth/login?next=%2Fpublications%2Fadmin",
    ],
    [
      "GET",
      "/publications/admin/secret.txt",
      "http://localhost/auth/login?next=%2Fpublications%2Fadmin%2Fsecret.txt",
    ],
    [
      "POST",
      "/api/publications",
      "http://localhost/auth/login?next=%2Fapi%2Fpublications",
    ],
    [
      "POST",
      "/api/health/invalidate",
      "http://localhost/auth/login?next=%2Fapi%2Fhealth%2Finvalidate",
    ],
    [
      "PUT",
      "/api/contact",
      "http://localhost/auth/login?next=%2Fapi%2Fcontact",
    ],
    [
      "POST",
      "/api/contact/nested",
      "http://localhost/auth/login?next=%2Fapi%2Fcontact%2Fnested",
    ],
    [
      "POST",
      "/api/graphql/nested",
      "http://localhost/auth/login?next=%2Fapi%2Fgraphql%2Fnested",
    ],
    [
      "GET",
      "/api/extractions?job_id=not-a-uuid",
      "http://localhost/auth/login?next=%2Fapi%2Fextractions%3Fjob_id%3Dnot-a-uuid",
    ],
    [
      "POST",
      `/api/extractions?job_id=${EXTRACTION_ID}`,
      `http://localhost/auth/login?next=%2Fapi%2Fextractions%3Fjob_id%3D${EXTRACTION_ID}`,
    ],
  ] as const)(
    "redirects protected %s %s with exact next",
    async (method, pathname, expectedLocation) => {
      const response = await updateSession(
        new NextRequest(`http://localhost${pathname}`, { method }),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(expectedLocation);
    },
  );

  it("redirects an anonymous asset-like collection ID with the exact return target", async () => {
    const response = await updateSession(
      new NextRequest("http://localhost/collections/secret.txt?tab=documents"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/login?next=%2Fcollections%2Fsecret.txt%3Ftab%3Ddocuments",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not apply the anonymous policy to an authenticated user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await updateSession(
      new NextRequest("http://localhost/search?q=vat"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
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

  it("strips a forged snapshot and preflights an owned asset-like collection ID", async () => {
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
        id: "secret.txt",
        user_id: "user-1",
        name: "Protected collection",
        documents: [],
        document_count: 0,
      }),
    });

    const response = await updateSession(
      new NextRequest("http://localhost/collections/secret.txt", {
        headers: { "x-juddges-collection-snapshot": "spoofed" },
      }),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/collections\/secret\.txt\?limit=20$/),
      expect.any(Object),
    );
    const snapshot = response.headers.get(
      "x-middleware-request-x-juddges-collection-snapshot",
    );
    expect(snapshot).toBeTruthy();
    expect(snapshot).not.toBe("spoofed");
    expect(decodeCollectionSnapshot(snapshot, "secret.txt")).toMatchObject({
      id: "secret.txt",
      user_id: "user-1",
    });
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

  it("allows exact single-segment schema API reads to reach validation and auth handling", async () => {
    const id = "abcdef01-1234-4abc-8def-1234567890ab";
    for (const segment of [id, "not-a-uuid", `${id}.css`]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await updateSession(
          new NextRequest(`http://localhost/api/schemas/${segment}`, { method })
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
      }
    }

    for (const path of [
      `/api/schemas/${id}/nested`,
      "/api/schemas/nested/value.css",
    ]) {
      const response = await updateSession(new NextRequest(`http://localhost${path}`));
      expect(response.status).toBe(307);
    }
  });

  it("strips forged schema proof headers and returns only verified auth state", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "verified-token",
          user: { id: "owner-1" },
        },
      },
      error: null,
    });
    const result = await updateSessionWithAuth(
      new NextRequest(
        "http://localhost/schemas/abcdef01-1234-4abc-8def-1234567890ab",
        {
          headers: {
            "x-juddges-schema-snapshot": "forged",
            "x-juddges-schema-snapshot-signature": "forged",
            "x-juddges-schema-snapshot-user": "attacker",
          },
        }
      )
    );

    expect(result.userId).toBe("owner-1");
    expect(result.accessToken).toBe("verified-token");
    expect(result.request.headers.get("x-juddges-schema-snapshot")).toBeNull();
    expect(result.request.headers.get("x-juddges-schema-snapshot-signature")).toBeNull();
    expect(result.request.headers.get("x-juddges-schema-snapshot-user")).toBeNull();
  });

  it("rejects a schema access token whose session user differs from the verified user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "attacker-token",
          user: { id: "attacker" },
        },
      },
      error: null,
    });

    const result = await updateSessionWithAuth(
      new NextRequest(
        "http://localhost/schemas/abcdef01-1234-4abc-8def-1234567890ab"
      )
    );

    expect(result.userId).toBeNull();
    expect(result.accessToken).toBeNull();
    expect(result.authFailure).toBe("unauthenticated");
    expect(result.response.status).toBe(307);
  });

  it("strips forged extraction proof headers before downstream handling", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: {
        session: { access_token: "access-token", user: { id: "user-1" } },
      },
      error: null,
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

  it("keeps operational auth failures distinct for the exact schema page", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503, message: "auth service unavailable" },
    });
    const result = await updateSessionWithAuth(
      new NextRequest(
        "http://localhost/schemas/abcdef01-1234-4abc-8def-1234567890ab"
      )
    );
    expect(result.response.status).toBe(200);
    expect(result.authFailure).toBe("unavailable");
  });

  it("clears schema auth state when the session lookup throws", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mockGetSession.mockRejectedValue(new Error("session service unavailable"));

    const result = await updateSessionWithAuth(
      new NextRequest(
        "http://localhost/schemas/abcdef01-1234-4abc-8def-1234567890ab"
      )
    );

    expect(result.userId).toBeNull();
    expect(result.accessToken).toBeNull();
    expect(result.authFailure).toBe("unavailable");
  });
});

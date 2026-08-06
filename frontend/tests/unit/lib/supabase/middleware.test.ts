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

import {
  updateSession,
  updateSessionWithAuth,
} from "@/lib/supabase/middleware";

describe("Supabase middleware public route policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });
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

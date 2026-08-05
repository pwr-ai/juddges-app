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
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
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
      data: { session: { access_token: "verified-token" } },
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

  it("strips forged extraction proof headers before downstream handling", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
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

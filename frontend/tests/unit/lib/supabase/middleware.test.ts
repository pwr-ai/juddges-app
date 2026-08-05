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
  });

  it("lets only the retired GraphQL route fall through to Next.js 404", async () => {
    const retiredRoute = await updateSession(
      new NextRequest("http://localhost/api/graphql", { method: "POST" }),
    );
    const lookalikeRoute = await updateSession(
      new NextRequest("http://localhost/api/graphql/nested", { method: "POST" }),
    );

    expect(retiredRoute.status).toBe(200);
    expect(retiredRoute.headers.get("location")).toBeNull();
    expect(lookalikeRoute.status).toBe(307);
    expect(lookalikeRoute.headers.get("location")).toBe(
      "http://localhost/auth/login?next=%2Fapi%2Fgraphql%2Fnested",
    );
  });

  it("lets only exact anonymous metadata GETs reach the JSON handler", async () => {
    const exact = await updateSession(
      new NextRequest("http://localhost/api/documents/doc-1/metadata"),
    );
    const exactHead = await updateSession(
      new NextRequest("http://localhost/api/documents/doc-1/metadata", {
        method: "HEAD",
      }),
    );
    const wrongMethod = await updateSession(
      new NextRequest("http://localhost/api/documents/doc-1/metadata", {
        method: "POST",
      }),
    );
    const nested = await updateSession(
      new NextRequest("http://localhost/api/documents/doc-1/metadata/nested"),
    );

    expect(exact.status).toBe(200);
    expect(exact.headers.get("location")).toBeNull();
    expect(exactHead.status).toBe(200);
    expect(exactHead.headers.get("location")).toBeNull();
    expect(wrongMethod.status).toBe(307);
    expect(nested.status).toBe(307);
  });

  it("strips forged document proof headers and preserves the method", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });

    const result = await updateSessionWithAuth(
      new NextRequest("http://localhost/documents/doc-1", {
        method: "DELETE",
        headers: {
          "x-juddges-document-metadata": "spoofed",
          "x-juddges-document-metadata-signature": "forged",
          "x-juddges-verified-user-id": "attacker",
        },
      }),
    );

    expect(result.request.method).toBe("DELETE");
    expect(result.request.headers.get("x-juddges-document-metadata")).toBeNull();
    expect(
      result.request.headers.get("x-juddges-document-metadata-signature"),
    ).toBeNull();
    expect(result.request.headers.get("x-juddges-verified-user-id")).toBeNull();
    expect(result.userId).toBe("owner-1");
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
      }),
    );

    expect(result.userId).toBe("user-1");
    expect(result.accessToken).toBe("access-token");
    expect(result.request.headers.get("x-juddges-extraction-snapshot")).toBeNull();
    expect(
      result.request.headers.get("x-juddges-extraction-snapshot-signature"),
    ).toBeNull();
    expect(
      result.request.headers.get("x-juddges-extraction-verified-user"),
    ).toBeNull();
  });
});

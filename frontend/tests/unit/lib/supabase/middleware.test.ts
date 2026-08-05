/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockGetUser = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
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

  it('lets only exact anonymous metadata GETs reach the JSON handler', async () => {
    const exact = await updateSession(
      new NextRequest('http://localhost/api/documents/doc-1/metadata')
    );
    const wrongMethod = await updateSession(
      new NextRequest('http://localhost/api/documents/doc-1/metadata', {
        method: 'POST',
      })
    );
    const nested = await updateSession(
      new NextRequest('http://localhost/api/documents/doc-1/metadata/nested')
    );

    expect(exact.status).toBe(200);
    expect(exact.headers.get('location')).toBeNull();
    expect(wrongMethod.status).toBe(307);
    expect(nested.status).toBe(307);
  });

  it('strips spoofed trusted headers and preserves the request method', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'owner-1' } },
      error: null,
    });

    const result = await updateSessionWithAuth(
      new NextRequest('http://localhost/documents/doc-1', {
        method: 'DELETE',
        headers: {
          'x-juddges-document-metadata': 'spoofed',
          'x-juddges-document-metadata-signature': 'forged',
          'x-juddges-verified-user-id': 'attacker',
        },
      })
    );

    expect(result.request.method).toBe('DELETE');
    expect(result.request.headers.get('x-juddges-document-metadata')).toBeNull();
    expect(
      result.request.headers.get('x-juddges-document-metadata-signature')
    ).toBeNull();
    expect(result.request.headers.get('x-juddges-verified-user-id')).toBeNull();
    expect(result.userId).toBe('owner-1');
  });
});

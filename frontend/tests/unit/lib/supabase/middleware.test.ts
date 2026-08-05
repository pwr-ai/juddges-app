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

import { updateSession } from "@/lib/supabase/middleware";

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
});

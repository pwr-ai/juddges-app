/** @jest-environment node */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/supabase/middleware", () => ({
  updateSessionWithAuth: jest.fn(),
}));

import { middleware } from "@/middleware";
import { updateSessionWithAuth } from "@/lib/supabase/middleware";
import type { SessionUpdate } from "@/lib/supabase/middleware";

const mockUpdateSessionWithAuth = jest.mocked(updateSessionWithAuth);

function unavailableSession(request: NextRequest): SessionUpdate {
  return {
    response: NextResponse.next({ request }),
    request,
    userId: null,
    accessToken: null,
    authFailure: "unavailable",
  };
}

describe("document detail auth failure boundary", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ["page", "/documents/visible-doc", "text/html"],
    ["metadata BFF", "/api/documents/visible-doc/metadata", "application/json"],
  ])("returns retryable 503 for an auth outage on the exact %s", async (_, path, type) => {
    const request = new NextRequest(`http://localhost${path}`);
    mockUpdateSessionWithAuth.mockResolvedValue(unavailableSession(request));

    const response = await middleware(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain(type);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "/api/documents/visible-doc/metadata"],
    ["GET", "/api/documents/visible-doc/metadata/nested"],
    ["GET", "/documents/nested/visible-doc"],
  ])("does not open protected %s lookalike %s", async (method, path) => {
    const request = new NextRequest(`http://localhost${path}`, { method });
    mockUpdateSessionWithAuth.mockResolvedValue({
      ...unavailableSession(request),
      response: NextResponse.redirect("http://localhost/auth/login"),
    });

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/auth/login");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

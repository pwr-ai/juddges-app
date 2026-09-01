/** @jest-environment node */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/supabase/middleware", () => ({
  updateSessionWithAuth: jest.fn(),
}));

import { middleware } from "@/middleware";
import { updateSessionWithAuth } from "@/lib/supabase/middleware";
import type { SessionUpdate } from "@/lib/supabase/middleware";

const mockUpdateSessionWithAuth = jest.mocked(updateSessionWithAuth);

const VALID_METADATA = {
  document_id: "visible-doc",
  document_type: "judgment",
  language: "pl",
};

function metadataUpstreamOk(): void {
  (global.fetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify(VALID_METADATA), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function unavailableSession(request: NextRequest): SessionUpdate {
  return {
    response: NextResponse.next({ request }),
    request,
    userId: null,
    accessToken: null,
    authFailure: "unavailable",
  };
}

function anonymousSession(
  request: NextRequest,
  response: NextResponse,
): SessionUpdate {
  return {
    response,
    request,
    userId: null,
    accessToken: null,
    authFailure: "unauthenticated",
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

  // Issue #510 — the judgment page carries no identity, so an auth-service
  // outage must not take the public reading path down with it.
  it("serves the judgment page through an auth outage", async () => {
    const request = new NextRequest("http://localhost/documents/visible-doc");
    mockUpdateSessionWithAuth.mockResolvedValue(unavailableSession(request));
    metadataUpstreamOk();

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)["X-User-ID"]).toBe("anonymous");
  });

  it("lets the metadata BFF handle an auth outage itself", async () => {
    const request = new NextRequest(
      "http://localhost/api/documents/visible-doc/metadata",
    );
    mockUpdateSessionWithAuth.mockResolvedValue(unavailableSession(request));

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps an invalid page session on the login path", async () => {
    const request = new NextRequest("http://localhost/documents/visible-doc");
    mockUpdateSessionWithAuth.mockResolvedValue(
      anonymousSession(
        request,
        NextResponse.redirect(
          "http://localhost/auth/login?next=%2Fdocuments%2Fvisible-doc",
        ),
      ),
    );

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/login");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes an anonymous metadata BFF read through to the route", async () => {
    const request = new NextRequest(
      "http://localhost/api/documents/visible-doc/metadata",
    );
    mockUpdateSessionWithAuth.mockResolvedValue(
      anonymousSession(request, NextResponse.next({ request })),
    );

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("signs anonymous judgment metadata under the reserved principal", async () => {
    const request = new NextRequest("http://localhost/documents/visible-doc");
    mockUpdateSessionWithAuth.mockResolvedValue(
      anonymousSession(request, NextResponse.next({ request })),
    );
    metadataUpstreamOk();

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
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

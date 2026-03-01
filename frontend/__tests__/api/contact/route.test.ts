/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/server");
jest.mock("@/lib/logger", () => ({
  child: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

global.fetch = jest.fn();

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/contact/route";
import { resetContactRateLimitStoreForTests } from "@/app/api/contact/rate-limit";

type InsertResult = { error: null | { message: string } };

function mockSupabaseInsert(result: InsertResult): jest.Mock {
  const insert = jest.fn().mockResolvedValue(result);
  (createClient as jest.Mock).mockResolvedValue({
    from: jest.fn().mockReturnValue({ insert }),
  });
  return insert;
}

function buildRequest(body: Record<string, unknown>, ip = "203.0.113.10"): NextRequest {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "Jest",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetContactRateLimitStoreForTests();

    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.CONTACT_INTERNAL_EMAIL = "enterprise@legal-ai.augustyniak.ai";
    process.env.CONTACT_FROM_EMAIL = "noreply@legal-ai.augustyniak.ai";
    process.env.CONTACT_RATE_LIMIT_MAX = "5";
    process.env.CONTACT_RATE_LIMIT_WINDOW_MS = "3600000";
  });

  it("returns 400 for invalid payload", async () => {
    const response = await POST(
      buildRequest({ name: "A", email: "bad", company: "", message: "short" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("persists contact submission and sends internal + confirmation emails", async () => {
    const insert = mockSupabaseInsert({ error: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });

    const response = await POST(
      buildRequest({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Legal",
        message: "We need enterprise access for 40 users.",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Legal",
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when database insert fails", async () => {
    mockSupabaseInsert({ error: { message: "db unavailable" } });

    const response = await POST(
      buildRequest({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Legal",
        message: "We need enterprise access for 40 users.",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("returns 500 when email delivery fails", async () => {
    mockSupabaseInsert({ error: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });

    const response = await POST(
      buildRequest({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Legal",
        message: "We need enterprise access for 40 users.",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.code).toBe("INTERNAL_ERROR");
  });

  it("rejects honeypot submissions", async () => {
    const response = await POST(
      buildRequest({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "Acme Legal",
        message: "We need enterprise access for 40 users.",
        website: "https://spam.example",
      })
    );

    expect(response.status).toBe(400);
  });

  it("enforces IP-based rate limits", async () => {
    process.env.CONTACT_RATE_LIMIT_MAX = "1";

    mockSupabaseInsert({ error: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    });

    const payload = {
      name: "Jane Doe",
      email: "jane@example.com",
      company: "Acme Legal",
      message: "We need enterprise access for 40 users.",
    };

    const first = await POST(buildRequest(payload, "198.51.100.20"));
    const second = await POST(buildRequest(payload, "198.51.100.20"));
    const secondData = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(secondData.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

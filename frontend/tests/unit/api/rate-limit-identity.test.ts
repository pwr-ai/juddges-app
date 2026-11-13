/**
 * @jest-environment node
 */

import { createHash } from "node:crypto";

import {
  rateLimitIdentity,
  withRateLimitIdentity,
} from "@/app/api/utils/rate-limit-identity";

describe("rate-limit identity headers", () => {
  it("hashes the verified user id before forwarding it", () => {
    const userId = "verified-user-123";

    expect(rateLimitIdentity(userId)).toBe(
      createHash("sha256").update(userId).digest("hex"),
    );
  });

  it("keeps different verified users in different buckets", () => {
    expect(rateLimitIdentity("user-a")).not.toBe(rateLimitIdentity("user-b"));
  });

  it("overwrites caller-supplied identity headers regardless of casing", () => {
    const headers = withRateLimitIdentity(
      {
        "x-ratelimit-identity": "spoofed-lower",
        "X-RATELIMIT-IDENTITY": "spoofed-upper",
        Authorization: "Bearer verified-token",
      },
      "verified-user",
    );

    expect(headers["X-RateLimit-Identity"]).toBe(rateLimitIdentity("verified-user"));
    expect(
      Object.keys(headers).filter(
        (key) => key.toLowerCase() === "x-ratelimit-identity",
      ),
    ).toEqual(["X-RateLimit-Identity"]);
    expect(headers.Authorization).toBe("Bearer verified-token");
  });
});

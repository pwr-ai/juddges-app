/** @jest-environment node */

import {
  decodeSchemaSnapshot,
  encodeSchemaSnapshot,
  isCanonicalSchemaId,
  signSchemaSnapshot,
  verifySchemaSnapshot,
} from "@/lib/schemas/detail-transport";

const schema = {
  id: "abcdef01-1234-4abc-8def-1234567890ab",
  name: "Contract schema",
  description: "Extract contract terms",
  type: "legal",
  category: "contract",
  text: { type: "object", properties: {} },
  dates: {},
  status: "published" as const,
  is_verified: true,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  user_id: "owner-1",
};

describe("schema detail transport", () => {
  it("accepts only canonical lowercase UUID route IDs", () => {
    expect(isCanonicalSchemaId(schema.id)).toBe(true);
    expect(isCanonicalSchemaId(schema.id.toUpperCase())).toBe(false);
    expect(isCanonicalSchemaId("11111111111141118111111111111111")).toBe(false);
    expect(isCanonicalSchemaId(`${schema.id}.css`)).toBe(false);
  });

  it("round-trips a validated schema snapshot", () => {
    expect(decodeSchemaSnapshot(encodeSchemaSnapshot(schema), schema.id)).toEqual(schema);
  });

  it("rejects malformed and mismatched snapshots", () => {
    const malformed = Buffer.from(JSON.stringify({ id: schema.id })).toString("base64url");
    expect(() => decodeSchemaSnapshot(malformed, schema.id)).toThrow(
      "Invalid verified schema snapshot"
    );
    expect(() =>
      decodeSchemaSnapshot(
        encodeSchemaSnapshot(schema),
        "22222222-2222-4222-8222-222222222222"
      )
    ).toThrow("Invalid verified schema snapshot");
  });

  it("binds the HMAC to user, route, and payload", async () => {
    const payload = encodeSchemaSnapshot(schema);
    const path = `/schemas/${schema.id}`;
    const signature = await signSchemaSnapshot(payload, "owner-1", path, "secret");

    await expect(
      verifySchemaSnapshot(payload, signature, "owner-1", path, "secret")
    ).resolves.toBe(true);
    await expect(
      verifySchemaSnapshot(payload, signature, "attacker", path, "secret")
    ).resolves.toBe(false);
    await expect(
      verifySchemaSnapshot(payload, signature, "owner-1", `${path}/nested`, "secret")
    ).resolves.toBe(false);
    await expect(
      verifySchemaSnapshot(`${payload}A`, signature, "owner-1", path, "secret")
    ).resolves.toBe(false);
    await expect(
      verifySchemaSnapshot(payload, "forged", "owner-1", path, "secret")
    ).resolves.toBe(false);
  });
});

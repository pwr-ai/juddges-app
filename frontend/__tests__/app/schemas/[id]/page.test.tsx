/** @jest-environment node */

import React from "react";

jest.mock("next/headers", () => ({ headers: jest.fn() }));
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  })),
}));
jest.mock("@/lib/server/schema-detail", () => {
  const actual = jest.requireActual("@/lib/server/schema-detail");
  return { ...actual, fetchSchemaDetail: jest.fn() };
});
jest.mock("@/app/schemas/[id]/client", () => ({
  __esModule: true,
  default: jest.fn((props: unknown) =>
    React.createElement("div", { "data-testid": "schema-client" }, JSON.stringify(props))
  ),
}));

import SchemaDetailPage from "@/app/schemas/[id]/page";
import SchemaDetailClient from "@/app/schemas/[id]/client";
import SchemaDetailFailure from "@/components/schemas/SchemaDetailFailure";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchSchemaDetail } from "@/lib/server/schema-detail";
import {
  SCHEMA_FAILURE_STATUS_HEADER,
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  encodeSchemaSnapshot,
  signSchemaSnapshot,
} from "@/lib/schemas/detail-transport";

const mockHeaders = jest.mocked(headers);
const mockNotFound = jest.mocked(notFound);
const mockClient = jest.mocked(SchemaDetailClient);
const mockFetchSchemaDetail = jest.mocked(fetchSchemaDetail);

const ID = "abcdef01-1234-4abc-8def-1234567890ab";
const schema = {
  id: ID,
  name: "Contract schema",
  description: null,
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

describe("schema detail server page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = "snapshot-secret";
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    mockFetchSchemaDetail.mockResolvedValue(schema);
  });

  it("renders a large schema from one user-scoped full read after signed proof", async () => {
    const largeSchema = {
      ...schema,
      text: { legalDefinition: "x".repeat(147_000) },
    };
    mockFetchSchemaDetail.mockResolvedValue(largeSchema);
    const encoded = encodeSchemaSnapshot(schema);
    const signature = await signSchemaSnapshot(
      encoded,
      "owner-1",
      `/schemas/${ID}`,
      "snapshot-secret"
    );
    const values = new Map([
      [SCHEMA_SNAPSHOT_HEADER, encoded],
      [SCHEMA_SNAPSHOT_SIGNATURE_HEADER, signature],
      [SCHEMA_SNAPSHOT_USER_HEADER, "owner-1"],
    ]);
    mockHeaders.mockResolvedValue(
      new Headers(Object.fromEntries(values)) as unknown as Awaited<ReturnType<typeof headers>>
    );

    const result = await SchemaDetailPage({ params: Promise.resolve({ id: ID }) });

    expect(React.isValidElement(result)).toBe(true);
    expect(result.type).toBe(mockClient);
    expect(result.props).toEqual(
      expect.objectContaining({ initialSchema: largeSchema })
    );
    expect(mockFetchSchemaDetail).toHaveBeenCalledTimes(1);
    expect(mockFetchSchemaDetail).toHaveBeenCalledWith(
      ID,
      "verified-token"
    );
  });

  it("does not perform the full read when proof user differs from auth user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "attacker" } },
      error: null,
    });
    const encoded = encodeSchemaSnapshot(schema);
    const signature = await signSchemaSnapshot(
      encoded,
      "owner-1",
      `/schemas/${ID}`,
      "snapshot-secret"
    );
    mockHeaders.mockResolvedValue(
      new Headers({
        [SCHEMA_SNAPSHOT_HEADER]: encoded,
        [SCHEMA_SNAPSHOT_SIGNATURE_HEADER]: signature,
        [SCHEMA_SNAPSHOT_USER_HEADER]: "owner-1",
      }) as unknown as Awaited<ReturnType<typeof headers>>
    );

    await expect(
      SchemaDetailPage({ params: Promise.resolve({ id: ID }) })
    ).rejects.toThrow(/verified schema user/i);
    expect(mockFetchSchemaDetail).not.toHaveBeenCalled();
  });

  it("turns a noncanonical route ID into not found", async () => {
    await expect(
      SchemaDetailPage({ params: Promise.resolve({ id: `${ID}.css` }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500, 502, 503, 504])(
    "renders the application failure surface for trusted status %i",
    async (status) => {
      mockHeaders.mockResolvedValue(
        new Headers({
          [SCHEMA_FAILURE_STATUS_HEADER]: String(status),
        }) as unknown as Awaited<ReturnType<typeof headers>>
      );

      const result = await SchemaDetailPage({
        params: Promise.resolve({ id: ID }),
      });

      expect(React.isValidElement(result)).toBe(true);
      expect(result.type).toBe(SchemaDetailFailure);
      expect(result.props).toEqual({ status });
      expect(mockClient).not.toHaveBeenCalled();
      expect(mockNotFound).not.toHaveBeenCalled();
    }
  );

  it.each([
    [null, null, null],
    ["forged", "forged", "attacker"],
  ])("never trusts a missing or forged middleware snapshot", async (payload, signature, user) => {
    const values: Record<string, string> = {};
    if (payload) values[SCHEMA_SNAPSHOT_HEADER] = payload;
    if (signature) values[SCHEMA_SNAPSHOT_SIGNATURE_HEADER] = signature;
    if (user) values[SCHEMA_SNAPSHOT_USER_HEADER] = user;
    mockHeaders.mockResolvedValue(
      new Headers(values) as unknown as Awaited<ReturnType<typeof headers>>
    );
    await expect(
      SchemaDetailPage({ params: Promise.resolve({ id: ID }) })
    ).rejects.toThrow(/verified schema snapshot/i);
    expect(mockClient).not.toHaveBeenCalled();
  });
});

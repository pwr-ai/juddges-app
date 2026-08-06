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
const mockCreateClient = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));
jest.mock("@/lib/server/schema-detail", () => {
  const actual = jest.requireActual("@/lib/server/schema-detail");
  return { ...actual, fetchSchemaDetail: jest.fn() };
});
jest.mock("@/app/schemas/[id]/loader", () => ({
  __esModule: true,
  default: jest.fn((props: unknown) =>
    React.createElement("div", { "data-testid": "schema-loader" }, JSON.stringify(props))
  ),
}));

import SchemaDetailPage from "@/app/schemas/[id]/page";
import SchemaDetailLoader from "@/app/schemas/[id]/loader";
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
const mockLoader = jest.mocked(SchemaDetailLoader);
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
    mockCreateClient.mockResolvedValue({
      auth: { getUser: mockGetUser, getSession: mockGetSession },
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: "verified-token",
          user: { id: "owner-1" },
        },
      },
      error: null,
    });
    mockFetchSchemaDetail.mockResolvedValue(schema);
  });

  async function verifiedHeaders(
    signedUser = "owner-1",
    signedPath = `/schemas/${ID}`
  ): Promise<Headers> {
    const encoded = encodeSchemaSnapshot(schema);
    const signature = await signSchemaSnapshot(
      encoded,
      signedUser,
      signedPath,
      "snapshot-secret"
    );
    return new Headers({
      [SCHEMA_SNAPSHOT_HEADER]: encoded,
      [SCHEMA_SNAPSHOT_SIGNATURE_HEADER]: signature,
      [SCHEMA_SNAPSHOT_USER_HEADER]: signedUser,
    });
  }

  it("renders the client loader without a second auth lookup after successful preflight", async () => {
    mockCreateClient.mockRejectedValue(new Error("auth unavailable"));
    mockHeaders.mockResolvedValue(
      (await verifiedHeaders()) as unknown as Awaited<ReturnType<typeof headers>>
    );

    const result = await SchemaDetailPage({ params: Promise.resolve({ id: ID }) });

    expect(React.isValidElement(result)).toBe(true);
    expect(result.type).toBe(mockLoader);
    expect(result.key).toBe(ID);
    expect(result.props).toEqual({ schemaId: ID });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockFetchSchemaDetail).not.toHaveBeenCalled();
  });

  it("renders the client loader without a second full read after successful preflight", async () => {
    mockFetchSchemaDetail.mockRejectedValue(
      new Error("the forbidden second read returned 503")
    );
    mockHeaders.mockResolvedValue(
      (await verifiedHeaders()) as unknown as Awaited<ReturnType<typeof headers>>
    );

    const result = await SchemaDetailPage({ params: Promise.resolve({ id: ID }) });

    expect(result.type).toBe(mockLoader);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockFetchSchemaDetail).not.toHaveBeenCalled();
  });

  it("rejects a proof signed for another path without auth or schema reads", async () => {
    mockHeaders.mockResolvedValue(
      (await verifiedHeaders("owner-1", `/schemas/${ID}-other`)) as unknown as Awaited<
        ReturnType<typeof headers>
      >
    );

    await expect(
      SchemaDetailPage({ params: Promise.resolve({ id: ID }) })
    ).rejects.toThrow(/verified schema snapshot/i);
    expect(mockCreateClient).not.toHaveBeenCalled();
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
      expect(mockLoader).not.toHaveBeenCalled();
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
    expect(mockLoader).not.toHaveBeenCalled();
  });
});

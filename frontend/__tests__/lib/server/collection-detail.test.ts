/**
 * @jest-environment node
 */

jest.mock("@/lib/supabase/server");

global.fetch = jest.fn();

import { createClient } from "@/lib/supabase/server";
import {
  isValidCollectionId,
  loadCollectionDetail,
} from "@/lib/server/collection-detail";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function mockAuth(userId: string | null = USER_ID) {
  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("no session"),
      }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: userId ? { access_token: "access-token" } : null,
        },
      }),
    },
  });
}

describe("collection detail server loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ["valid UUID", COLLECTION_ID, true],
    ["legacy safe ID", "case_collection-1.2", true],
    ["space", "unsafe collection", false],
    ["slash", "unsafe/collection", false],
    ["empty", "", false],
    ["overlong", "a".repeat(256), false],
  ])("validates %s IDs", (_label, id, expected) => {
    expect(isValidCollectionId(id)).toBe(expected);
  });

  it("does not call auth or upstream for an invalid ID", async () => {
    await expect(loadCollectionDetail("unsafe collection")).resolves.toEqual({
      kind: "invalid",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when no verified user exists", async () => {
    mockAuth(null);

    await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("loads a collection with the verified user's bearer token", async () => {
    mockAuth();
    const collection = {
      id: COLLECTION_ID,
      user_id: USER_ID,
      name: "Mine",
      documents: [],
      document_count: 0,
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => collection,
    });

    await expect(
      loadCollectionDetail(COLLECTION_ID, { limit: 20 })
    ).resolves.toEqual({ kind: "ok", collection });
    expect(global.fetch).toHaveBeenCalledWith(
      `http://localhost:8004/collections/${COLLECTION_ID}?limit=20`,
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("maps both missing and other-user payloads to the same not-found result", async () => {
    mockAuth();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: COLLECTION_ID,
          user_id: "other-user",
          name: "Secret",
          documents: [],
        }),
      });

    await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
      kind: "not_found",
    });
    await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
      kind: "not_found",
    });
  });

  it.each([401, 403, 500, 503])(
    "keeps upstream status %s distinct from not-found",
    async (status) => {
      mockAuth();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status });

      await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
        kind: "unavailable",
        status,
        reason: status === 401 || status === 403 ? "upstream_auth" : "upstream",
      });
    }
  );

  it("maps timeout and transport failures to distinct retryable statuses", async () => {
    mockAuth();
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(new Error("network down"));

    await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
      kind: "unavailable",
      status: 504,
      reason: "timeout",
    });
    await expect(loadCollectionDetail(COLLECTION_ID)).resolves.toEqual({
      kind: "unavailable",
      status: 502,
      reason: "transport",
    });
  });
});

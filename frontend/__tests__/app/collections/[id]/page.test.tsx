/**
 * @jest-environment node
 */

import React from "react";

const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockRedirect = jest.fn((location: string) => {
  throw new Error(`NEXT_REDIRECT:${location}`);
});
const mockCollectionClient = jest.fn((_props: unknown) => null);
const mockLoadCollectionDetail = jest.fn();

jest.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  redirect: (location: string) => mockRedirect(location),
}));
jest.mock("@/app/collections/[id]/client", () => ({
  __esModule: true,
  default: (props: unknown) => mockCollectionClient(props),
}));
jest.mock("@/lib/server/collection-detail", () => ({
  loadCollectionDetail: (...args: unknown[]) => mockLoadCollectionDetail(...args),
  CollectionDetailUnavailableError: class CollectionDetailUnavailableError extends Error {
    status: number;

    constructor(status: number) {
      super("Collection service unavailable");
      this.status = status;
    }
  },
}));

import CollectionPage from "@/app/collections/[id]/page";

const COLLECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COLLECTION = {
  id: COLLECTION_ID,
  user_id: "user-1",
  name: "My collection",
  description: null,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  documents: [],
  document_count: 0,
};

describe("CollectionPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(["not_found", "invalid"])(
    "uses the Next not-found boundary for %s collections",
    async (kind) => {
      mockLoadCollectionDetail.mockResolvedValue({ kind });

      await expect(
        CollectionPage({ params: Promise.resolve({ id: COLLECTION_ID }) })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    }
  );

  it("redirects an unauthenticated request without classifying it as missing", async () => {
    mockLoadCollectionDetail.mockResolvedValue({ kind: "unauthenticated" });

    await expect(
      CollectionPage({ params: Promise.resolve({ id: COLLECTION_ID }) })
    ).rejects.toThrow(
      `NEXT_REDIRECT:/auth/login?next=%2Fcollections%2F${COLLECTION_ID}`
    );

    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it.each([500, 503, 504])(
    "throws a retryable page error for upstream status %s",
    async (status) => {
      mockLoadCollectionDetail.mockResolvedValue({
        kind: "unavailable",
        status,
        reason: status === 504 ? "timeout" : "upstream",
      });

      await expect(
        CollectionPage({ params: Promise.resolve({ id: COLLECTION_ID }) })
      ).rejects.toMatchObject({
        message: "Collection service unavailable",
        status,
      });
      expect(mockNotFound).not.toHaveBeenCalled();
    }
  );

  it("passes the server-authorized collection to the interactive client", async () => {
    mockLoadCollectionDetail.mockResolvedValue({
      kind: "ok",
      collection: COLLECTION,
    });

    const element = await CollectionPage({
      params: Promise.resolve({ id: COLLECTION_ID }),
    });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props).toEqual({
      id: COLLECTION_ID,
      initialCollection: COLLECTION,
    });
  });
});

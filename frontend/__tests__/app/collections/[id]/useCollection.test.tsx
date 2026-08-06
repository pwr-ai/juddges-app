/**
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from "@testing-library/react";

const mockGetCollection = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/api/collections", () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  updateCollection: jest.fn(),
  addDocumentToCollection: jest.fn(),
  removeDocumentFromCollection: jest.fn(),
  deleteCollection: jest.fn(),
  addDocumentsToCollection: jest.fn(),
  loadAllCollectionDocuments: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  child: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/styles/components", () => ({
  showSuccessToast: jest.fn(),
}));

import { useCollection } from "@/app/collections/[id]/_components/useCollection";

const COLLECTION = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  user_id: "user-1",
  name: "Hydrated collection",
  description: "Already loaded",
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  documents: [],
  document_count: 37,
};

describe("useCollection hydration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves hydrated counts and skips the immediate detail refetch", async () => {
    const { result } = renderHook(() =>
      useCollection(COLLECTION.id, COLLECTION)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.totalDocumentCount).toBe(37);
      expect(result.current.allDocumentsLoaded).toBe(false);
    });
    expect(result.current.collection).toEqual(COLLECTION);
    expect(mockGetCollection).not.toHaveBeenCalled();
  });
});

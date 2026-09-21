/**
 * @jest-environment jsdom
 *
 * Wiring test for /documents/[id]: `?f=<blob>` -> decodeFilters ->
 * matchedMetadataKeys -> KeyInformation `highlightKeys`/`id`/`highlightCaption`.
 * `useDocument` is mocked so this renders the real DocumentPageClient without
 * network/auth (see frontend/__tests__/app/documents/page.test.tsx for the
 * sibling pattern that instead mocks fetch).
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";

import { encodeFilters } from "@/lib/extractions/use-extracted-data-filters";

const mockUseDocument = jest.fn();
const mockUseSearchParams = jest.fn();

jest.mock("next/link", () => {
  return ({ children, ...props }: any) => <a {...props}>{children}</a>;
});

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "doc-1" }),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => mockUseSearchParams(),
  usePathname: () => "/documents/doc-1",
}));

jest.mock("@/app/documents/[id]/_components/useDocument", () => ({
  useDocument: () => mockUseDocument(),
}));

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

jest.mock("dompurify", () => ({
  __esModule: true,
  default: {
    sanitize: (value: string) => value,
  },
}));

import { DocumentPageClient } from "@/app/documents/[id]/_components/DocumentPageClient";

const baseHookReturn = {
  authLoading: false,
  similarDocs: [],
  enrichedSimilarDocs: [],
  loading: false,
  error: null,
  htmlString: "<p>Document body</p>",
  summaryResult: null,
  isSummarizing: false,
  summaryError: null,
  summaryType: "executive" as const,
  setSummaryType: jest.fn(),
  summaryLength: "medium" as const,
  setSummaryLength: jest.fn(),
  isSummaryPanelOpen: false,
  setIsSummaryPanelOpen: jest.fn(),
  keyPointsResult: null,
  isExtractingKeyPoints: false,
  keyPointsError: null,
  isKeyPointsPanelOpen: false,
  setIsKeyPointsPanelOpen: jest.fn(),
  canUseDocumentAI: false,
  fetchDocumentData: jest.fn(),
  handleGenerateSummary: jest.fn(),
  handleExtractKeyPoints: jest.fn(),
};

const metadata = {
  document_id: "doc-1",
  document_type: "judgment",
  language: "en",
  title: "Test judgment",
  country: "PL",
  base_num_victims: 2,
};

function setSearchParams(params: Record<string, string>): void {
  mockUseSearchParams.mockReturnValue(new URLSearchParams(params));
}

describe("DocumentPageClient highlight wiring", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDocument.mockReturnValue({ ...baseHookReturn, metadata });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("highlights matched base fields and the anchor when ?f= matches metadata", () => {
    const blob = encodeFilters({ jurisdiction: ["PL"] });
    setSearchParams({ f: blob });

    render(<DocumentPageClient documentId="doc-1" initialMetadata={metadata as any} />);

    const section = document.getElementById("base-fields");
    expect(section).not.toBeNull();
    expect(screen.getByText(/field.*matched your filter/i)).toBeInTheDocument();

    // "PL" also renders in the sticky header badge; scope to the base-fields
    // grid so we assert on the metadata cell, not the header chip.
    const countryCell = within(section as HTMLElement).getByText("PL").closest('[data-matched]');
    expect(countryCell).toHaveAttribute("data-matched", "true");

    expect(
      within(section as HTMLElement).getAllByText("Matched filter", { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-matched="false"]').length).toBeGreaterThan(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("renders no caption and no highlights when ?f= is absent", () => {
    setSearchParams({});

    render(<DocumentPageClient documentId="doc-1" initialMetadata={metadata as any} />);

    expect(screen.queryByText(/matched your filter/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-matched="true"]')).toHaveLength(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("falls back to a normal render when ?f= is malformed, with no console noise", () => {
    setSearchParams({ f: "not-a-valid-blob!!!" });

    render(<DocumentPageClient documentId="doc-1" initialMetadata={metadata as any} />);

    expect(screen.queryByText(/matched your filter/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-matched="true"]')).toHaveLength(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});

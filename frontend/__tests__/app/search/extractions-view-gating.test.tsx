/**
 * The list query is disabled behind the statistics view (#708) but React
 * Query keeps its last error. A list failure followed by a switch to
 * Statistics must not hide the statistics behind the list's error card.
 */
import { render, screen } from "@testing-library/react";
import React from "react";

let mockView: "list" | "stats" = "list";
jest.mock("@/lib/extractions/use-extracted-data-filters", () => ({
  useExtractedDataFilters: () => ({
    filters: {}, textQuery: "", page: 1, pageSize: 25, nlQuestion: undefined,
    view: mockView, sampleSize: undefined, seed: 1, statsFields: ["appeal_outcome"],
    setFilters: jest.fn(), setTextQuery: jest.fn(), setPage: jest.fn(), setNlQuestion: jest.fn(),
    removeFilter: jest.fn(), clearAll: jest.fn(), activeCount: 0,
    setView: jest.fn(), setSampling: jest.fn(), reshuffle: jest.fn(), setStatsFields: jest.fn(),
  }),
}));
jest.mock("@/lib/extractions/base-schema-filter-api", () => ({
  useExtractionResults: () => ({ data: undefined, isLoading: false, isFetching: false, error: new Error("boom"), refetch: jest.fn() }),
  useExtractionFacet: () => ({ data: undefined }),
}));
jest.mock("@/app/search/extractions/_components/StatisticsView", () => ({
  StatisticsView: () => <div data-testid="statistics-view" />,
}));
jest.mock("@/app/search/extractions/_components/ViewToggle", () => ({ ViewToggle: () => null }));
jest.mock("@/components/filters/extracted-search-filters", () => ({ ActiveFilterChips: () => null }));
jest.mock("@/components/search/BaseFiltersDrawer", () => ({ BaseFiltersDrawer: () => null }));
jest.mock("@/components/search/NlFilterDialog", () => ({ NlFilterDialog: () => null }));
jest.mock("@/components/search/QuickFilters", () => ({ QuickFilters: () => null }));
jest.mock("@/components/search/SaveAsCollectionDialog", () => ({ SaveAsCollectionDialog: () => null }));
jest.mock("@/components/search/ScopeFilters", () => ({ ScopeFilters: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Page = require("@/app/search/extractions/page").default;

describe("/search/extractions view gating with a stale list error", () => {
  it("shows the list error card in the list view", () => {
    mockView = "list";
    render(<Page />);
    expect(screen.getByRole("alert")).toHaveTextContent("Results could not be loaded");
    expect(screen.queryByTestId("statistics-view")).not.toBeInTheDocument();
  });

  it("shows the statistics view, not the list error, in the statistics view", () => {
    mockView = "stats";
    render(<Page />);
    expect(screen.getByTestId("statistics-view")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });
});

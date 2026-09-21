/**
 * Covers the `describeActive` active-count badge rendered by `FieldRow`
 * inside `ExtractedFilterDrawer` (components/filters/extracted-search-filters.tsx).
 *
 * `describeActive`'s array branch is shared by this badge and by
 * `ActiveFilterChips` (see active-filter-chips.test.tsx). For `enum_multi`
 * fields with <=3 selected values it now renders the joined, humanised
 * labels instead of a bare count; longer selections still fall back to a
 * count. This file is the drawer-badge half of that coverage.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ExtractedFilterDrawer } from "@/components/filters/extracted-search-filters";
import type { BaseSchemaFilters } from "@/types/base-schema-filter";

function renderDrawer(filters: BaseSchemaFilters) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ExtractedFilterDrawer filters={filters} onChange={() => {}} activeCount={0} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Filters/i }));
}

describe("ExtractedFilterDrawer — FieldRow active badge (enum_multi)", () => {
  it("shows joined humanised labels for 1-3 selected values", () => {
    renderDrawer({ offender_gender: ["gender_male", "gender_female"] });
    expect(
      screen.getByText("Gender male, Gender female"),
    ).toBeInTheDocument();
  });

  it("falls back to a bare count for 4+ selected values", () => {
    renderDrawer({
      offender_job_offence: ["employed", "self_employed", "unemployed", "student"],
    });
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText(/^Employed,/)).not.toBeInTheDocument();
  });
});

/**
 * The sidebar's only extraction entry points at /search/extractions, which
 * SEARCHES extracted data. A user who has never run an extraction lands here,
 * reads that extraction must happen first, and has no way to start one --
 * /extract is reachable only through Cmd+K or a typed URL (#579).
 *
 * The filtered case is deliberately different: there the user's problem is the
 * filters, and pointing them at a fresh extraction would be wrong advice.
 */
import { render, screen } from "@testing-library/react";
import React from "react";

import { ResultList } from "@/app/search/extractions/page";

function renderList(
  overrides: Partial<React.ComponentProps<typeof ResultList>> = {}
) {
  return render(
    <ResultList
      rows={[]}
      isLoading={false}
      hasActiveFilters={false}
      onClearAll={() => {}}
      {...overrides}
    />
  );
}

describe("extraction search empty state", () => {
  it("offers a way to start an extraction when nothing has been extracted yet", () => {
    renderList({ rows: [], hasActiveFilters: false });

    const cta = screen.getByRole("link", { name: /extract/i });
    expect(cta).toHaveAttribute("href", "/extract");
  });

  it("does not offer it when the emptiness is caused by filters", () => {
    renderList({ rows: [], hasActiveFilters: true });

    expect(
      screen.queryByRole("link", { name: /extract/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear all filters/i })
    ).toBeInTheDocument();
  });

  it("offers nothing while the first page is still loading", () => {
    renderList({ rows: [], isLoading: true });

    expect(
      screen.queryByRole("link", { name: /extract/i })
    ).not.toBeInTheDocument();
  });
});

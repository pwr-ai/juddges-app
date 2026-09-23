import { fireEvent, render, screen } from "@testing-library/react";

import type { PrecedentCohortItem } from "@/lib/api/advanced";

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values
        ? `${key}:${Object.entries(values)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")}`
        : key,
  }),
}));

jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (props: {
    items: { name: string; count: number }[];
    onBarClick?: (name: string) => void;
  }) => (
    <div data-testid="chart">
      {props.items.map((i) => (
        <button key={i.name} onClick={() => props.onBarClick?.(i.name)}>
          {i.name}: {i.count}
        </button>
      ))}
    </div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CohortInsights } = require("@/app/precedents/_components/CohortInsights");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeCohort } = require("./cohort-fixture");

describe("CohortInsights", () => {
  it("renders the headline from the biggest bucket", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={5}
        onFilterChange={() => {}}
      />,
    );

    // "dismissed" isn't a real appeal_outcome enum token (the fixture's
    // shorthand), so it only round-trips through formatEnumLabel's
    // capitalization, not the enum-prefix stripping — see the real-token
    // test below for that path.
    expect(
      screen.getByText("precedents.cohortHeadline:count=3,total=5,value=Dismissed"),
    ).toBeInTheDocument();
  });

  it("strips the shared enum prefix for a real appeal_outcome token", () => {
    render(
      <CohortInsights
        cohort={makeCohort().map((item: PrecedentCohortItem) => ({
          ...item,
          appeal_outcome: item.appeal_outcome.includes("dismissed")
            ? ["outcome_dismissed_or_refused"]
            : item.appeal_outcome,
        }))}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={5}
        onFilterChange={() => {}}
      />,
    );

    expect(
      screen.getByText(
        "precedents.cohortHeadline:count=3,total=5,value=Dismissed or refused",
      ),
    ).toBeInTheDocument();
  });

  it("groups by a different field when the selector changes", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={5}
        onFilterChange={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("precedents.cohortGroupBy"), {
      target: { value: "convict_offences" },
    });

    expect(screen.getByRole("button", { name: "theft: 2" })).toBeInTheDocument();
  });

  it("reports a bar click as a filter on the active field", () => {
    const onFilterChange = jest.fn();
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={5}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "dismissed: 3" }));

    expect(onFilterChange).toHaveBeenCalledWith({
      field: "appeal_outcome",
      value: "dismissed",
    });
  });

  it("shows the active filter with a clear control", () => {
    const onFilterChange = jest.fn();
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={{ field: "appeal_outcome", value: "dismissed" }}
        filteredRankedCount={2}
        totalRankedCount={5}
        onFilterChange={onFilterChange}
      />,
    );

    expect(
      screen.getByText("precedents.cohortFilterActive:value=Dismissed,count=2,total=5"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "precedents.cohortClearFilter" }));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("warns when the filter matches no ranked precedent", () => {
    render(
      <CohortInsights
        cohort={makeCohort()}
        filter={{ field: "appeal_outcome", value: "dismissed" }}
        filteredRankedCount={0}
        totalRankedCount={5}
        onFilterChange={() => {}}
      />,
    );

    expect(screen.getByText("precedents.cohortNoRanked")).toBeInTheDocument();
  });

  it("renders nothing for an empty cohort", () => {
    const { container } = render(
      <CohortInsights
        cohort={[]}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={0}
        onFilterChange={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

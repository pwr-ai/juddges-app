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
        <button key={i.name} data-testid={`bar-${i.name}`} aria-label={`bar ${i.name}`} onClick={() => props.onBarClick?.(i.name)} />
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

  // AC-1, AC-2, AC-4
  it("headline ignores a dominant outcome_unknown bucket", () => {
    const base = makeCohort()[0];
    const row = (id: string, appeal_outcome: string[]): PrecedentCohortItem => ({
      ...base,
      document_id: id,
      appeal_outcome,
    });
    const cohort = [
      row("u1", ["outcome_unknown"]),
      row("u2", ["outcome_unknown"]),
      row("u3", ["outcome_unknown"]),
      row("k1", ["outcome_dismissed_or_refused"]),
      row("k2", ["outcome_dismissed_or_refused"]),
      row("k3", ["outcome_allowed"]),
      row("m1", []),
    ];

    render(
      <CohortInsights
        cohort={cohort}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={7}
        onFilterChange={() => {}}
      />,
    );

    expect(
      screen.getByText("precedents.cohortHeadline:count=2,total=7,value=Dismissed or refused"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/value=Outcome unknown|value=Unknown/i)).not.toBeInTheDocument();
    // The chart keeps the unknown bar.
    expect(screen.getByTestId("bar-outcome_unknown")).toBeInTheDocument();
  });

  // AC-1 (headline chosen before the top-10 slice)
  it("headline finds a known bucket ranked below the top 10 buckets", () => {
    const base = makeCohort()[0];
    const row = (id: string, appeal_outcome: string[]): PrecedentCohortItem => ({
      ...base,
      document_id: id,
      appeal_outcome,
    });
    const cohort: PrecedentCohortItem[] = [];
    for (let i = 1; i <= 10; i++) {
      cohort.push(row(`x${i}a`, [`reason${i}_unknown`]), row(`x${i}b`, [`reason${i}_unknown`]));
    }
    cohort.push(row("k1", ["outcome_dismissed_or_refused"]));

    render(
      <CohortInsights
        cohort={cohort}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={21}
        onFilterChange={() => {}}
      />,
    );

    expect(screen.getByText(/^precedents\.cohortHeadline:count=1,total=21,value=/)).toBeInTheDocument();
    expect(screen.queryByText("precedents.cohortEmpty")).not.toBeInTheDocument();
  });

  // AC-3, AC-4
  it("falls back to cohortEmpty when every bucket is unknown", () => {
    const base = makeCohort()[0];
    const cohort = [
      { ...base, document_id: "u1", appeal_outcome: ["outcome_unknown"] },
      { ...base, document_id: "u2", appeal_outcome: ["outcome_unknown"] },
      { ...base, document_id: "u3", appeal_outcome: ["dont_know"] },
    ];

    render(
      <CohortInsights
        cohort={cohort}
        filter={null}
        filteredRankedCount={0}
        totalRankedCount={3}
        onFilterChange={() => {}}
      />,
    );

    expect(screen.getByText("precedents.cohortEmpty")).toBeInTheDocument();
    expect(screen.queryByText(/precedents\.cohortHeadline/)).not.toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByTestId("bar-outcome_unknown")).toBeInTheDocument();
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

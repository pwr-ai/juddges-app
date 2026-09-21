import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({ t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }),
}));
jest.mock("@/components/charts", () => ({
  HorizontalBarChart: (p: { items: { name: string }[]; onBarClick?: (n: string) => void }) => (
    <div>{p.items.map((i) => <button key={i.name} onClick={() => p.onBarClick?.(i.name)}>{i.name}</button>)}</div>
  ),
}));
const aggregate = {
  total: 320, sample_n: 100, seed: 7,
  fields: { appeal_outcome: { kind: "categorical", multi: true, values: [{ value: "dismissed", count: 60 }], other: 0, null: 0, covered: 100 } },
};
let queryState: { data?: unknown; isLoading: boolean; error: unknown } = { data: aggregate, isLoading: false, error: null };
jest.mock("@/lib/extractions/base-schema-filter-api", () => ({ useExtractionAggregate: () => queryState }));
jest.mock("@/lib/api/dashboard", () => ({ useDashboardStats: () => ({ data: { total_judgments: 12907 } }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StatisticsView } = require("@/app/search/extractions/_components/StatisticsView");

function renderView(over: Partial<React.ComponentProps<typeof StatisticsView>> = {}) {
  const props = {
    filters: {}, textQuery: "", sampleSize: 100, seed: 7, fields: ["appeal_outcome"],
    onSampling: jest.fn(), onReshuffle: jest.fn(), onFields: jest.fn(), onDrillBack: jest.fn(),
    ...over,
  };
  render(<StatisticsView {...props} />);
  return props;
}

describe("StatisticsView", () => {
  beforeEach(() => { queryState = { data: aggregate, isLoading: false, error: null }; });

  it("shows the cohort line with corpus total and the sample line", () => {
    renderView();
    expect(screen.getByText(/statsCohortLine:.*"matched":"320".*"corpus":"12,907"/)).toBeInTheDocument();
    expect(screen.getByText(/statsSampleLine:.*"n":"100".*"seed":"7"/)).toBeInTheDocument();
  });

  it("Show judgments drills back without a filter patch", () => {
    const p = renderView();
    fireEvent.click(screen.getByRole("button", { name: "extraction.statsShowJudgments" }));
    expect(p.onDrillBack).toHaveBeenCalledWith(undefined);
  });

  it("a bar click drills back adding that value to the field's filter", () => {
    const p = renderView({ filters: { appeal_outcome: ["allowed"] } });
    fireEvent.click(screen.getByRole("button", { name: "dismissed" }));
    expect(p.onDrillBack).toHaveBeenCalledWith({ appeal_outcome: ["allowed", "dismissed"] });
  });

  it("a boolean bar drills back with a scalar boolean filter", () => {
    queryState = {
      data: {
        ...aggregate,
        fields: { did_offender_confess: { kind: "categorical", multi: false, values: [{ value: "true", count: 40 }], other: 0, null: 0, covered: 100 } },
      },
      isLoading: false,
      error: null,
    };
    const p = renderView({ fields: ["did_offender_confess"] });
    fireEvent.click(screen.getByRole("button", { name: "true" }));
    expect(p.onDrillBack).toHaveBeenCalledWith({ did_offender_confess: true });
  });

  it("a bar of a field without a filter predicate is inert", () => {
    queryState = {
      data: {
        ...aggregate,
        fields: { court_name: { kind: "categorical", multi: false, values: [{ value: "Court of Appeal", count: 40 }], other: 0, null: 0, covered: 100 } },
      },
      isLoading: false,
      error: null,
    };
    const p = renderView({ fields: ["court_name"] });
    fireEvent.click(screen.getByRole("button", { name: "Court of Appeal" }));
    expect(p.onDrillBack).not.toHaveBeenCalled();
  });

  it("renders the empty state when the cohort is empty", () => {
    queryState = { data: { ...aggregate, total: 0, sample_n: 0, fields: {} }, isLoading: false, error: null };
    renderView();
    expect(screen.getByText("extraction.statsEmpty")).toBeInTheDocument();
  });

  it("renders the error state", () => {
    queryState = { data: undefined, isLoading: false, error: new Error("x") };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("extraction.statsError");
  });
});

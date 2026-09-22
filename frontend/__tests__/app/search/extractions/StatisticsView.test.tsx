import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
interface QueryState { data?: unknown; isLoading: boolean; isFetching?: boolean; error: unknown; refetch?: jest.Mock }
const ready = (): QueryState => ({ data: aggregate, isLoading: false, isFetching: false, error: null, refetch: jest.fn() });
let queryState: QueryState = ready();
const useExtractionAggregate = jest.fn((_request: Record<string, unknown>) => queryState);
jest.mock("@/lib/extractions/base-schema-filter-api", () => ({ useExtractionAggregate: (request: Record<string, unknown>) => useExtractionAggregate(request) }));
let dashState: { data?: { total_judgments?: unknown } } = { data: { total_judgments: 12907 } };
jest.mock("@/lib/api/dashboard", () => ({ useDashboardStats: () => dashState }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StatisticsView } = require("@/app/search/extractions/_components/StatisticsView");

function renderView(over: Partial<React.ComponentProps<typeof StatisticsView>> = {}) {
  const props = {
    filters: {}, textQuery: "", sampleSize: 100, seed: 7, fields: ["appeal_outcome"],
    onSampling: jest.fn(), onReshuffle: jest.fn(), onFields: jest.fn(), onDrillBack: jest.fn(),
    ...over,
  };
  const utils = render(<StatisticsView {...props} />);
  return { ...props, rerender: (next: Partial<React.ComponentProps<typeof StatisticsView>>) => utils.rerender(<StatisticsView {...props} {...next} />) };
}

/** Request passed to the last `useExtractionAggregate` render. */
function lastRequest(): Record<string, unknown> {
  const calls = useExtractionAggregate.mock.calls;
  return calls[calls.length - 1][0];
}

describe("StatisticsView", () => {
  beforeEach(() => {
    queryState = ready();
    dashState = { data: { total_judgments: 12907 } };
    useExtractionAggregate.mockClear();
  });
  afterEach(() => { jest.useRealTimers(); });

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

  it("a bar click drills back narrowing the field's filter to that value (any-of semantics)", () => {
    const p = renderView({ filters: { appeal_outcome: ["allowed"] } });
    fireEvent.click(screen.getByRole("button", { name: "dismissed" }));
    expect(p.onDrillBack).toHaveBeenCalledWith({ appeal_outcome: ["dismissed"] });
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

  it("drops the corpus clause while the dashboard stats are unavailable", () => {
    dashState = { data: undefined };
    renderView();
    expect(screen.getByText(/statsCohortLineNoCorpus:\{"matched":"320"\}/)).toBeInTheDocument();
    expect(screen.queryByText(/statsCohortLine:/)).not.toBeInTheDocument();
  });

  it("renders the error state with a retry and the sampling controls still mounted", () => {
    queryState = { ...ready(), data: undefined, error: new Error("x") };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("extraction.statsError");
    fireEvent.click(screen.getByRole("button", { name: /common.retry/ }));
    expect(queryState.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radiogroup", { name: "extraction.statsScale" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "100" })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "extraction.statsYAxis" })).toBeInTheDocument();
  });

  it("announces the initial load", () => {
    queryState = { ...ready(), data: undefined, isLoading: true, isFetching: true };
    renderView();
    expect(screen.getByRole("status", { name: "common.loading" })).toBeInTheDocument();
  });

  it("marks the view busy and appends the updating copy while refetching over stale data", () => {
    queryState = { ...ready(), isFetching: true };
    renderView();
    expect(screen.getByText(/statsCohortLine:/)).toHaveTextContent("extraction.statsUpdating");
    expect(screen.getByText(/statsCohortLine:/).closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
  });

  it("labels the y-axis toggle as the axis, not the current unit", () => {
    renderView();
    expect(screen.getByRole("radiogroup", { name: "extraction.statsYAxis" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "extraction.statsYAxisCount" })).not.toBeInTheDocument();
  });

  describe("aggregate request contract", () => {
    it("sends sample_size and seed when sampling", () => {
      renderView({ sampleSize: 100, seed: 7, fields: ["appeal_outcome"] });
      const req = lastRequest();
      expect(req.sample_size).toBe(100);
      expect(req.seed).toBe(7);
      expect(req.fields).toEqual(["appeal_outcome"]);
      expect(req.filters).toEqual({});
      expect(req).not.toHaveProperty("collection_ids");
      expect(req).not.toHaveProperty("text_query");
    });

    it("omits sample_size and seed for the whole cohort", () => {
      renderView({ sampleSize: undefined, seed: 7 });
      const req = lastRequest();
      expect(req).not.toHaveProperty("sample_size");
      expect(req).not.toHaveProperty("seed");
    });

    it("forwards the fields prop as-is", () => {
      renderView({ fields: ["court_name", "appeal_outcome"] });
      expect(lastRequest().fields).toEqual(["court_name", "appeal_outcome"]);
    });

    it("debounces text_query by 300 ms; filters go out immediately", () => {
      jest.useFakeTimers();
      const view = renderView({ textQuery: "" });
      expect(lastRequest()).not.toHaveProperty("text_query");

      view.rerender({ textQuery: "narko", filters: { appeal_outcome: ["allowed"] } });
      expect(lastRequest().filters).toEqual({ appeal_outcome: ["allowed"] });
      expect(lastRequest()).not.toHaveProperty("text_query");

      act(() => { jest.advanceTimersByTime(299); });
      expect(lastRequest()).not.toHaveProperty("text_query");

      view.rerender({ textQuery: "narkotyki", filters: { appeal_outcome: ["allowed"] } });
      act(() => { jest.advanceTimersByTime(299); });
      expect(lastRequest()).not.toHaveProperty("text_query");

      act(() => { jest.advanceTimersByTime(1); });
      expect(lastRequest().text_query).toBe("narkotyki");
    });

    it("sends the initial text_query on mount without waiting", () => {
      jest.useFakeTimers();
      renderView({ textQuery: " judge " });
      expect(lastRequest().text_query).toBe("judge");
    });
  });

  describe("field set", () => {
    it("adding a field appends it to the current set", () => {
      const p = renderView({ fields: ["appeal_outcome"] });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "court_name" } });
      expect(p.onFields).toHaveBeenCalledWith(["appeal_outcome", "court_name"]);
    });

    it("removing a field drops only that field", () => {
      queryState = {
        ...ready(),
        data: {
          ...aggregate,
          fields: {
            ...aggregate.fields,
            court_name: { kind: "categorical", multi: false, values: [{ value: "Court of Appeal", count: 40 }], other: 0, null: 0, covered: 100 },
          },
        },
      };
      const p = renderView({ fields: ["appeal_outcome", "court_name"] });
      const card = screen.getByRole("region", { name: "Court" });
      fireEvent.click(within(card).getByRole("button", { name: "extraction.statsRemoveField" }));
      expect(p.onFields).toHaveBeenCalledWith(["appeal_outcome"]);
    });
  });
});

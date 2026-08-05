import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import UKJudgmentsAnalysisPage from "@/app/use-cases/uk-judgments/page";
import { useDashboardStats, type DashboardStats } from "@/lib/api/dashboard";

jest.mock("@/lib/api/dashboard", () => ({
  useDashboardStats: jest.fn(),
}));

jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
      const {
        // @ts-expect-error Framer Motion props are intentionally omitted in this test double.
        initial: _initial,
        // @ts-expect-error Framer Motion props are intentionally omitted in this test double.
        whileInView: _whileInView,
        // @ts-expect-error Framer Motion props are intentionally omitted in this test double.
        viewport: _viewport,
        // @ts-expect-error Framer Motion props are intentionally omitted in this test double.
        transition: _transition,
        ...domProps
      } = props;
      return <div {...domProps}>{children}</div>;
    },
  },
  useInView: () => true,
}));

jest.mock("recharts", () => ({
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const stats: DashboardStats = {
  total_judgments: 124,
  jurisdictions: { PL: 100, UK: 24 },
  court_levels: [
    { name: "Supreme", count: 4, jurisdiction: "UK" },
    { name: "Sąd Najwyższy", count: 9, jurisdiction: "PL" },
  ],
  top_courts: [
    { name: "Court of Appeal", count: 14, jurisdiction: "UK" },
    { name: "Supreme Court", count: 10, jurisdiction: "UK" },
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `Regional Court ${index + 1}`,
      count: 9 - index,
      jurisdiction: "UK" as const,
    })),
    { name: "Sąd Najwyższy", count: 70, jurisdiction: "PL" },
    { name: "Unscoped legacy court", count: 30 },
  ],
  decisions_per_year: [{ year: 2024, count: 124 }],
  decisions_per_year_by_jurisdiction: [
    { year: 2023, count: 8, jurisdiction: "UK" },
    { year: 2024, count: 16, jurisdiction: "UK" },
    { year: 2024, count: 100, jurisdiction: "PL" },
  ],
  date_range: { oldest: "2023-01-01", newest: "2024-12-31" },
  case_types: [],
  decision_types: [],
  data_completeness: {
    embeddings_pct: 0,
    structure_extraction_pct: 0,
    deep_analysis_pct: 0,
    with_summary_pct: 0,
    with_keywords_pct: 0,
    with_legal_topics_pct: 0,
    with_cited_legislation_pct: 0,
    avg_text_length_chars: 0,
  },
  top_legal_domains: null,
  top_keywords: [],
  computed_at: "2026-08-05T10:00:00Z",
};

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: stats,
    error: null,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDashboardStats>;
}

describe("UKJudgmentsAnalysisPage", () => {
  it("renders only UK corpus totals, top courts and yearly trend data", () => {
    jest.mocked(useDashboardStats).mockReturnValue(queryResult());

    render(<UKJudgmentsAnalysisPage />);

    expect(
      screen.getByRole("heading", { name: /United Kingdom judgments/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("uk-total-judgments")).toHaveTextContent("24");
    expect(screen.getByText("Courts shown").parentElement).toHaveTextContent(
      "10",
    );
    expect(
      screen.getByRole("img", { name: /UK judgments by court/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /UK judgments by year/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Court of Appeal")).toBeInTheDocument();
    expect(screen.getByText("Supreme Court")).toBeInTheDocument();
    expect(screen.getByText("2023")).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
    expect(screen.queryByText("Sąd Najwyższy")).not.toBeInTheDocument();
    expect(screen.queryByText("Unscoped legacy court")).not.toBeInTheDocument();
    expect(screen.queryByText("100")).not.toBeInTheDocument();
  });

  it("exposes a labelled loading state while statistics are pending", () => {
    jest.mocked(useDashboardStats).mockReturnValue(
      queryResult({ data: undefined, isLoading: true }),
    );

    render(<UKJudgmentsAnalysisPage />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading United Kingdom judgment statistics",
    );
  });

  it("shows the upstream error and lets the visitor retry", () => {
    const refetch = jest.fn();
    jest.mocked(useDashboardStats).mockReturnValue(
      queryResult({
        data: undefined,
        error: new Error("Statistics service unavailable"),
        isError: true,
        refetch,
      }),
    );

    render(<UKJudgmentsAnalysisPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Statistics service unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("states honestly when the UK corpus has no available records", () => {
    jest.mocked(useDashboardStats).mockReturnValue(
      queryResult({
        data: {
          ...stats,
          jurisdictions: { PL: 100, UK: 0 },
          top_courts: [],
          decisions_per_year_by_jurisdiction: [],
        },
      }),
    );

    render(<UKJudgmentsAnalysisPage />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No United Kingdom judgment statistics are available yet",
    );
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockFindPrecedents = jest.fn();

jest.mock("@/lib/api", () => ({
  findPrecedents: (...args: unknown[]) => mockFindPrecedents(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

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
const PrecedentsPage = require("@/app/precedents/page").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { makeCohort } = require("./cohort-fixture");

function precedent(id: string) {
  return {
    document_id: id,
    title: `Judgment ${id}`,
    document_type: "judgment",
    date_issued: "2023-01-01",
    court_name: "Court of Appeal",
    outcome: null,
    legal_bases: null,
    summary: null,
    similarity_score: 0.7,
    relevance_score: null,
    matching_factors: [],
    relevance_explanation: null,
  };
}

async function search(response: Record<string, unknown>) {
  mockFindPrecedents.mockResolvedValueOnce(response);
  render(<PrecedentsPage />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "a juvenile drug appeal with three co-defendants" },
  });
  fireEvent.click(screen.getByRole("button", { name: /search for precedents/i }));
  await waitFor(() => expect(mockFindPrecedents).toHaveBeenCalled());
}

beforeEach(() => mockFindPrecedents.mockReset());

describe("precedents page — cohort block", () => {
  it("renders the block above the ranked list", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1")],
      total_found: 1,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: makeCohort(),
      resolved_case: null,
    });

    expect(await screen.findByTestId("cohort-insights")).toBeInTheDocument();
  });

  it("filters the ranked list to the judgments carrying the clicked value", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1"), precedent("a1")],
      total_found: 2,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: makeCohort(),
      resolved_case: null,
    });

    expect(await screen.findByText("Judgment a1")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "dismissed: 3" }));

    await waitFor(() => expect(screen.queryByText("Judgment a1")).not.toBeInTheDocument());
    expect(screen.getByText("Judgment d1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "precedents.cohortClearFilter" }));
    await waitFor(() => expect(screen.getByText("Judgment a1")).toBeInTheDocument());
  });

  it("clears the active cohort filter on a new search", async () => {
    const response = {
      query: "q",
      precedents: [precedent("d1"), precedent("a1")],
      total_found: 2,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: makeCohort(),
      resolved_case: null,
    };
    await search(response);

    fireEvent.click(await screen.findByRole("button", { name: "dismissed: 3" }));
    await waitFor(() => expect(screen.queryByText("Judgment a1")).not.toBeInTheDocument());

    mockFindPrecedents.mockResolvedValueOnce(response);
    fireEvent.click(screen.getByRole("button", { name: /search for precedents/i }));

    await waitFor(() => expect(mockFindPrecedents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Judgment a1")).toBeInTheDocument());
  });

  it("shows the resolved-case banner when the query matched a docket", async () => {
    await search({
      query: "III CSK 245/22",
      precedents: [],
      total_found: 0,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: [],
      resolved_case: { case_number: "III CSK 245/22", document_id: "uuid", title: "A v B" },
    });

    expect(
      await screen.findByText("precedents.resolvedCase:caseNumber=III CSK 245/22"),
    ).toBeInTheDocument();
  });

  it("renders no block when the cohort is empty", async () => {
    await search({
      query: "q",
      precedents: [precedent("d1")],
      total_found: 1,
      search_strategy: "semantic_similarity",
      enhanced_query: null,
      cohort: [],
      resolved_case: null,
    });

    expect(await screen.findByText("Judgment d1")).toBeInTheDocument();
    expect(screen.queryByTestId("cohort-insights")).not.toBeInTheDocument();
  });
});

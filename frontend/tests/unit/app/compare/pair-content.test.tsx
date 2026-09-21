import { render, screen } from "@testing-library/react";

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
    locale: "en",
  }),
}));
jest.mock("@/components/charts/BivariateBarChart", () => ({
  BivariateBarChart: () => <div data-testid="bivariate" />,
}));
const useComparePair = jest.fn();
jest.mock("@/lib/compare/api", () => ({
  useComparePair: (id: string) => useComparePair(id),
  downloadCompareCsv: jest.fn(),
}));

import { PairContent } from "@/app/compare/_components/PairContent";
import type { PairCompareResponse } from "@/lib/compare/types";

const base: Omit<PairCompareResponse, "extension" | "extension_reason" | "fields"> = {
  jurisdictions: ["PL", "UK"],
  totals: { PL: 3, UK: 2 },
  ignored_filter_keys: [],
  text_query: null,
  filters: { collection_ids: ["c-pl", "c-uk"] },
  pair: { id: "p1", name: "Fraud", pl_collection_id: "c-pl", uk_collection_id: "c-uk" },
};

describe("PairContent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("links both collections and invites extraction when neither side has run one", () => {
    useComparePair.mockReturnValue({
      data: { ...base, fields: [], extension: null, extension_reason: "no_jobs" },
      isLoading: false,
      isError: false,
    });
    render(<PairContent pairId="p1" />);

    expect(screen.getByRole("heading", { name: "Fraud" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fraud — PL/ })).toHaveAttribute("href", "/collections/c-pl");
    expect(screen.getByRole("link", { name: /Fraud — UK/ })).toHaveAttribute("href", "/collections/c-uk");
    expect(screen.getByText("compare.pairNoSchema")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /extractOnBoth.*PL/ })).toHaveAttribute(
      "href",
      "/extract?collection=c-pl",
    );
    expect(screen.getByRole("link", { name: /extractOnBoth.*UK/ })).toHaveAttribute(
      "href",
      "/extract?collection=c-uk",
    );
  });

  it.each([
    ["no_job_pl", "compare.pairExtensionNoJobPl"],
    ["no_job_uk", "compare.pairExtensionNoJobUk"],
    ["schema_mismatch", "compare.pairExtensionSchemaMismatch"],
    ["schema_not_found", "compare.pairExtensionSchemaNotFound"],
    ["extension_failed", "compare.pairExtensionFailed"],
  ] as const)("shows the %s notice", (reason, key) => {
    useComparePair.mockReturnValue({
      data: { ...base, fields: [], extension: null, extension_reason: reason },
      isLoading: false,
      isError: false,
    });
    render(<PairContent pairId="p1" />);
    expect(screen.getByText(key)).toBeInTheDocument();
  });

  it("renders extension-schema fields in their own labelled region", () => {
    useComparePair.mockReturnValue({
      data: {
        ...base,
        fields: [],
        extension: {
          schema_id: "s1",
          schema_name: "Sentencing",
          source: "schema:s1",
          jobs: {},
          totals: { PL: 3, UK: 2 },
          fields: [
            {
              field: "verdict",
              label: "Verdict",
              source: "schema:s1",
              kind: "enum",
              tier: "primary",
              missing_in: [],
              coverage: { PL: { covered: 3, total: 3, ratio: 1 }, UK: { covered: 2, total: 2, ratio: 1 } },
              values: [{ value: "guilty", counts: { PL: 2, UK: 1 }, shares: { PL: 0.67, UK: 0.5 } }],
            },
          ],
        },
        extension_reason: null,
      },
      isLoading: false,
      isError: false,
    });
    render(<PairContent pairId="p1" />);

    const region = screen.getByRole("region", { name: "compare.pairSchemaSection" });
    expect(region).toHaveTextContent("Verdict");
    expect(screen.queryByText("compare.pairNoSchema")).not.toBeInTheDocument();
  });

  it("renders the base fields through CompareView", () => {
    useComparePair.mockReturnValue({
      data: {
        ...base,
        extension: null,
        extension_reason: "no_jobs",
        fields: [
          {
            field: "appellant",
            label: "Appellant",
            source: "base",
            kind: "enum",
            tier: "primary",
            missing_in: [],
            coverage: { PL: { covered: 3, total: 3, ratio: 1 }, UK: { covered: 2, total: 2, ratio: 1 } },
            values: [{ value: "offender", counts: { PL: 3, UK: 2 }, shares: { PL: 1, UK: 1 } }],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<PairContent pairId="p1" />);
    expect(screen.getByText("Appellant")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    useComparePair.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<PairContent pairId="p1" />);
    expect(screen.queryByRole("heading", { name: "Fraud" })).not.toBeInTheDocument();
  });

  it("shows an error state", () => {
    useComparePair.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<PairContent pairId="p1" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

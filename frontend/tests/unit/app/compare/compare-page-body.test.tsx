import { fireEvent, render, screen } from "@testing-library/react";

let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/compare",
}));
jest.mock("@/components/charts/BivariateBarChart", () => ({
  BivariateBarChart: () => <div data-testid="bivariate" />,
}));
jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
}));
const useCompare = jest.fn();
const createCollectionPair = jest.fn();
jest.mock("@/lib/compare/api", () => ({
  useCompare: (...args: unknown[]) => useCompare(...args),
  downloadCompareCsv: jest.fn(),
  createCollectionPair: (...a: unknown[]) => createCollectionPair(...a),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { ComparePageBody } from "@/app/compare/_components/ComparePageBody";

describe("ComparePageBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    search = "q=fraud&nl=offenders%20convicted%20of%20fraud";
    useCompare.mockReturnValue({
      data: {
        jurisdictions: ["PL", "UK"],
        totals: { PL: 1, UK: 1 },
        fields: [],
        ignored_filter_keys: [],
        filters: {},
        text_query: "fraud",
        pair: null,
      },
      error: null,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: jest.fn(),
    });
  });

  it("opens the save-pair dialog pre-filled with the natural-language question", () => {
    render(<ComparePageBody />);
    fireEvent.click(screen.getByRole("button", { name: "compare.savePair" }));

    const input = screen.getByLabelText("compare.savePairName") as HTMLInputElement;
    expect(input.value).toBe("offenders convicted of fraud");
  });
});

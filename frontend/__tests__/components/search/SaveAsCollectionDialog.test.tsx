import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createCollectionFromFilter = jest.fn();

jest.mock("@/lib/api/collections", () => ({
  createCollectionFromFilter: (...args: unknown[]) => createCollectionFromFilter(...args),
  CollectionFromFilterError: class extends Error {
    code: string;
    status: number;
    total?: number;
    cap?: number;
    jurisdiction?: string | null;

    constructor(
      message: string,
      code: string,
      status: number,
      total?: number,
      cap?: number,
      jurisdiction?: string | null,
    ) {
      super(message);
      this.name = "CollectionFromFilterError";
      this.code = code;
      this.status = status;
      this.total = total;
      this.cap = cap;
      this.jurisdiction = jurisdiction;
    }
  },
}));

import { CollectionFromFilterError } from "@/lib/api/collections";
import { SaveAsCollectionDialog } from "@/components/search/SaveAsCollectionDialog";

const filters = { jurisdiction: ["PL", "UK"] as ("PL" | "UK")[] };

describe("SaveAsCollectionDialog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is disabled with an explanation when there are no results", () => {
    render(<SaveAsCollectionDialog filters={{}} textQuery="" total={0} defaultName="" />);
    const btn = screen.getByRole("button", { name: /save as collection/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/no results/i));
  });

  it("prefills the name with the question, lets the user edit it, saves and redirects", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collections: [{ jurisdiction: "PL", collection: { id: "c9" }, added_count: 42 }],
      total_matched: 42,
      pair_id: null,
    });
    render(
      <SaveAsCollectionDialog
        filters={filters}
        textQuery="fraud"
        total={42}
        defaultName="kobiety skazane za oszustwo, PL i UK, 2015–2024"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i) as HTMLInputElement;
    expect(input.value).toBe("kobiety skazane za oszustwo, PL i UK, 2015–2024");
    fireEvent.change(input, { target: { value: "Fraud PL+UK 2015–2024" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/c9"));
    expect(createCollectionFromFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fraud PL+UK 2015–2024",
        filters,
        text_query: "fraud",
      }),
    );
  });

  it("shows the backend message (with cap/total) on a 413 and stays open", async () => {
    createCollectionFromFilter.mockRejectedValue(
      new CollectionFromFilterError(
        "Too many judgments to save as a collection.",
        "FILTER_TOO_LARGE",
        413,
        7000,
        5000,
      ),
    );
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={7000} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too many judgments/i);
    expect(alert).toHaveTextContent("7,000");
    expect(alert).toHaveTextContent("5,000");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a generic message when the error isn't a CollectionFromFilterError", async () => {
    createCollectionFromFilter.mockRejectedValue(new Error("network down"));
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={10} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/i);
  });
});

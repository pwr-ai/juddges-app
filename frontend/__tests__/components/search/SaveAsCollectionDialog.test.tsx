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

    // router.push doesn't unmount the component in this test, so if `saving`
    // stayed true the dialog would be stuck un-closable (Cancel disabled,
    // button reading "Saving…") whenever navigation doesn't actually unmount.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /cancel/i })).not.toBeDisabled();
  });

  it("pluralizes the dialog title like the results bar", () => {
    const { rerender } = render(
      <SaveAsCollectionDialog filters={filters} textQuery="" total={1} defaultName="q" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    expect(screen.getByText("Save 1 judgment as a collection")).toBeInTheDocument();

    rerender(
      <SaveAsCollectionDialog filters={filters} textQuery="" total={2} defaultName="q" />,
    );
    expect(screen.getByText("Save 2 judgments as a collection")).toBeInTheDocument();
  });

  it("shows an error instead of crashing when the backend returns no collection", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collections: [],
      total_matched: 0,
      pair_id: null,
    });
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/collection was not created/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the backend's own message on a 413, without a duplicated suffix, and stays open", async () => {
    // The backend already spells out total/cap in its message (see
    // backend/app/collections_from_filter.py) — the dialog must not append
    // its own "(N matched, limit M.)" on top of it.
    createCollectionFromFilter.mockRejectedValue(
      new CollectionFromFilterError(
        "The filter matches 7000 judgments; a collection may hold at most 5000. Narrow the filter.",
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
    expect(alert).toHaveTextContent(
      "The filter matches 7000 judgments; a collection may hold at most 5000. Narrow the filter.",
    );
    expect(alert).not.toHaveTextContent("matched, limit");
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

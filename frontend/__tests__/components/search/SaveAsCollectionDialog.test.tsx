import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createCollectionFromFilter = jest.fn();

// AC-3
jest.mock("@/lib/api/collections", () => ({
  ...jest.requireActual("@/lib/api/collections"),
  createCollectionFromFilter: (...args: unknown[]) => createCollectionFromFilter(...args),
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

    // AC-1: once created, Save stays disabled (no double-submit window) but
    // Cancel stays enabled so the dialog can never be stuck un-closable.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancel/i })).not.toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  // AC-2
  it("ignores a second Save click while the first request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    createCollectionFromFilter.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createCollectionFromFilter).toHaveBeenCalledTimes(1);
    resolve({
      collections: [{ jurisdiction: "PL", collection: { id: "c9" }, added_count: 5 }],
      total_matched: 5,
      pair_id: null,
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  // AC-1, AC-2
  it("does not create twice when Enter is pressed again after success", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collections: [{ jurisdiction: "PL", collection: { id: "c9" }, added_count: 5 }],
      total_matched: 5,
      pair_id: null,
    });
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(createCollectionFromFilter).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  // AC-1
  it("clears the succeeded latch when the dialog is reopened", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collections: [{ jurisdiction: "PL", collection: { id: "c9" }, added_count: 5 }],
      total_matched: 5,
      pair_id: null,
    });
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancel/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByLabelText(/collection name/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  // AC-2
  it("saves on Enter in the name input and redirects", async () => {
    createCollectionFromFilter.mockResolvedValue({
      collections: [{ jurisdiction: "PL", collection: { id: "c9" }, added_count: 5 }],
      total_matched: 5,
      pair_id: null,
    });
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    fireEvent.keyDown(screen.getByLabelText(/collection name/i), { key: "Enter" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/c9"));
    expect(createCollectionFromFilter).toHaveBeenCalledTimes(1);
  });

  // AC-2
  it("ignores Enter when the name is empty", () => {
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createCollectionFromFilter).not.toHaveBeenCalled();
  });

  // AC-2
  it("ignores Enter during IME composition", () => {
    render(<SaveAsCollectionDialog filters={filters} textQuery="" total={5} defaultName="q" />);
    fireEvent.click(screen.getByRole("button", { name: /save as collection/i }));
    const input = screen.getByLabelText(/collection name/i);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(createCollectionFromFilter).not.toHaveBeenCalled();
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

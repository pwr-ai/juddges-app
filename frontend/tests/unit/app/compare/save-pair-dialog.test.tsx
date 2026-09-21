import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en" }),
}));

const createCollectionPair = jest.fn();
jest.mock("@/lib/compare/api", () => ({
  createCollectionPair: (...a: unknown[]) => createCollectionPair(...a),
}));

import { CollectionFromFilterError } from "@/lib/api/collections";

import { SavePairDialog } from "@/app/compare/_components/SavePairDialog";

const savedResponse = {
  collections: [
    { jurisdiction: "PL", collection: { id: "c-pl" }, added_count: 3 },
    { jurisdiction: "UK", collection: { id: "c-uk" }, added_count: 2 },
  ],
  total_matched: 5,
  pair_id: "p1",
};

describe("SavePairDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("pre-fills the name from the free-text query and posts filters + text", async () => {
    createCollectionPair.mockResolvedValue(savedResponse);
    const onSaved = jest.fn();
    render(
      <SavePairDialog
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
        request={{ filters: { appellant: ["offender"] }, text_query: "fraud suspended" }}
      />,
    );
    const input = screen.getByLabelText("compare.savePairName") as HTMLInputElement;
    expect(input.value).toBe("fraud suspended");

    fireEvent.change(input, { target: { value: "Fraud" } });
    fireEvent.click(screen.getByRole("button", { name: "compare.savePair" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedResponse));
    expect(createCollectionPair).toHaveBeenCalledWith({
      name: "Fraud",
      filters: { appellant: ["offender"] },
      text_query: "fraud suspended",
    });
    expect(push).toHaveBeenCalledWith("/compare/p1");
  });

  it("prefers an explicit defaultName (the natural-language question) over text_query", () => {
    createCollectionPair.mockResolvedValue(savedResponse);
    render(
      <SavePairDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        defaultName="offenders convicted of fraud"
        request={{ filters: {}, text_query: "fraud suspended" }}
      />,
    );
    const input = screen.getByLabelText("compare.savePairName") as HTMLInputElement;
    expect(input.value).toBe("offenders convicted of fraud");
  });

  it("falls back to a joined chip summary when there is no query or default name", () => {
    render(
      <SavePairDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        request={{ filters: { appellant: ["offender"], plea_point: ["police_presence"] }, text_query: null }}
      />,
    );
    const input = screen.getByLabelText("compare.savePairName") as HTMLInputElement;
    expect(input.value).toBe("appellant, plea_point");
  });

  it("enforces a 200-character cap on the name", () => {
    render(
      <SavePairDialog
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        request={{ filters: {}, text_query: "x" }}
      />,
    );
    const input = screen.getByLabelText("compare.savePairName") as HTMLInputElement;
    expect(input.maxLength).toBe(200);
  });

  it("shows the too-large message with the backend body on 413", async () => {
    createCollectionPair.mockRejectedValue(
      new CollectionFromFilterError(
        "The filter matches 8000 judgments (PL); a collection may hold at most 5000.",
        "FILTER_TOO_LARGE",
        413,
        8000,
        5000,
        "PL",
      ),
    );
    render(
      <SavePairDialog open onOpenChange={() => {}} onSaved={() => {}} request={{ filters: {}, text_query: "x" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "compare.savePair" }));

    expect(await screen.findByText("compare.savePairTooLarge")).toBeInTheDocument();
    expect(
      await screen.findByText("The filter matches 8000 judgments (PL); a collection may hold at most 5000."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the per-side empty-filter message on 400 FILTER_EMPTY", async () => {
    createCollectionPair.mockRejectedValue(
      new CollectionFromFilterError("The filter matches no judgments for UK.", "FILTER_EMPTY", 400, undefined, undefined, "UK"),
    );
    render(
      <SavePairDialog open onOpenChange={() => {}} onSaved={() => {}} request={{ filters: {}, text_query: "x" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "compare.savePair" }));

    expect(await screen.findByText("The filter matches no judgments for UK.")).toBeInTheDocument();
    expect(screen.queryByText("compare.savePairTooLarge")).not.toBeInTheDocument();
  });

  it("shows a generic error message for anything else", async () => {
    createCollectionPair.mockRejectedValue(new Error("network down"));
    render(
      <SavePairDialog open onOpenChange={() => {}} onSaved={() => {}} request={{ filters: {}, text_query: "x" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "compare.savePair" }));

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("disables the save button while a save is in flight", async () => {
    let resolveSave: (value: typeof savedResponse) => void = () => {};
    createCollectionPair.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(
      <SavePairDialog open onOpenChange={() => {}} onSaved={() => {}} request={{ filters: {}, text_query: "x" }} />,
    );
    const saveButton = screen.getByRole("button", { name: "compare.savePair" });
    fireEvent.click(saveButton);
    await waitFor(() => expect(createCollectionPair).toHaveBeenCalledTimes(1));
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(createCollectionPair).toHaveBeenCalledTimes(1);
    resolveSave(savedResponse);
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});

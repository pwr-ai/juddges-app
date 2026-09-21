import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NlFilterDialog } from "@/components/search/NlFilterDialog";

describe("NlFilterDialog", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("passes the trimmed question as the third onApply argument", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        filters: { jurisdiction: ["PL"] },
        text_query: "fraud",
      }),
    });

    const onApply = jest.fn();
    render(<NlFilterDialog onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Describe your search" }));
    fireEvent.change(screen.getByLabelText("Natural-language question"), {
      target: { value: "  kobiety skazane za oszustwo, PL, 2015–2024  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Translate to filters" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply to form" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply to form" }));

    expect(onApply).toHaveBeenCalledWith(
      { jurisdiction: ["PL"] },
      "fraud",
      "kobiety skazane za oszustwo, PL, 2015–2024",
    );
  });
});

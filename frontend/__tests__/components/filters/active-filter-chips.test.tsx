import { fireEvent, render, screen } from "@testing-library/react";

import { ActiveFilterChips } from "@/components/filters/extracted-search-filters";

describe("ActiveFilterChips — core fields", () => {
  it("renders jurisdiction and decision_date as removable chips", () => {
    const onRemove = jest.fn();
    render(
      <ActiveFilterChips
        filters={{
          jurisdiction: ["PL", "UK"],
          decision_date: { from: "2015-01-01", to: "2024-12-31" },
          offender_gender: ["gender_female"],
        }}
        textQuery=""
        onRemove={onRemove}
        onClearText={() => {}}
        onClearAll={() => {}}
      />,
    );
    expect(screen.getByText("Jurisdiction:")).toBeInTheDocument();
    expect(screen.getByText("PL, UK")).toBeInTheDocument();
    expect(screen.getByText("Decision date:")).toBeInTheDocument();
    expect(screen.getByText("2015-01-01→2024-12-31")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Jurisdiction" }));
    expect(onRemove).toHaveBeenCalledWith("jurisdiction");
  });
});

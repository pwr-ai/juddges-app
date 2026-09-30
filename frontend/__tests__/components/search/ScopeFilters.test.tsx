import { fireEvent, render, screen } from "@testing-library/react";

import { ScopeFilters } from "@/components/search/ScopeFilters";

describe("ScopeFilters", () => {
  it("renders PL/UK checkboxes and a decision-date range", () => {
    render(<ScopeFilters filters={{}} onChange={() => {}} />);
    expect(screen.getByTestId("scope-filters")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "PL" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "UK" })).not.toBeChecked();
    expect(screen.getByLabelText("Decision date minimum")).toBeInTheDocument();
  });

  it("emits the full BaseSchemaFilters with jurisdiction toggled", () => {
    const onChange = jest.fn();
    render(<ScopeFilters filters={{ offender_gender: ["gender_female"] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "UK" }));
    expect(onChange).toHaveBeenCalledWith({
      offender_gender: ["gender_female"],
      jurisdiction: ["UK"],
    });
  });

  it("emits ISO from/to for decision_date", () => {
    const onChange = jest.fn();
    render(<ScopeFilters filters={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Decision date minimum"), {
      target: { value: "2015-01-01" },
    });
    expect(onChange).toHaveBeenCalledWith({
      decision_date: { from: "2015-01-01", to: undefined },
    });
  });

  it("reflects existing values", () => {
    render(
      <ScopeFilters
        filters={{ jurisdiction: ["PL"], decision_date: { from: "2015-01-01", to: "2024-12-31" } }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "PL" })).toBeChecked();
    expect(screen.getByLabelText("Decision date maximum")).toHaveValue("2024-12-31");
  });
});

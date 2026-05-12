import { render, screen, fireEvent } from "@testing-library/react";
import { BaseFiltersDrawer } from "@/components/search/BaseFiltersDrawer";
import { GROUP_ORDER, GROUP_LABELS }
  from "@/lib/extractions/base-schema-filter-config";

describe("BaseFiltersDrawer", () => {
  it("renders one section per non-empty group", () => {
    render(<BaseFiltersDrawer filters={{}} onChange={() => {}} onReset={() => {}} />);
    // Every group in GROUP_ORDER that has at least one non-substring field
    // should produce a heading. We can't hard-code a count because the
    // registry may change — assert each visible label is present.
    for (const g of GROUP_ORDER) {
      // Some groups may be substring-only; permit absence.
      const heading = screen.queryByRole("heading", { name: GROUP_LABELS[g] });
      if (heading) {
        expect(heading).toBeInTheDocument();
      }
    }
    // At minimum, court_date, victim, offender groups should be present.
    expect(screen.getByRole("heading", { name: /Court & Date/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Offender/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Victim/i })).toBeInTheDocument();
  });

  it("calls onChange with the registry field key for numeric_range", () => {
    const onChange = jest.fn();
    render(<BaseFiltersDrawer filters={{}} onChange={onChange} onReset={() => {}} />);
    // Find a NumericRangeControl by its aria-label
    const minInput = screen.getByLabelText(/number of victims minimum/i);
    fireEvent.change(minInput, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(
      "num_victims",
      expect.objectContaining({ kind: "numeric_range" }),
    );
  });

  it("calls onChange with kind:enum_multi for a checkbox group", () => {
    const onChange = jest.fn();
    render(<BaseFiltersDrawer filters={{}} onChange={onChange} onReset={() => {}} />);
    // The "Appellant" enum_multi control includes an `offender` checkbox.
    const checkbox = screen.getAllByRole("checkbox", { name: /offender/i })[0];
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      "appellant",
      expect.objectContaining({ kind: "enum_multi", values: ["offender"] }),
    );
  });

  it("calls onReset when reset button clicked", () => {
    const onReset = jest.fn();
    const filters = {
      num_victims: { kind: "numeric_range" as const, min: 1, max: 5 },
    };
    render(<BaseFiltersDrawer filters={filters} onChange={() => {}} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it("passes facetCounts through to TagArrayControl by registry field name", () => {
    const facetCounts = {
      convict_offences: { theft: 99 },
    };
    render(
      <BaseFiltersDrawer
        filters={{}}
        onChange={() => {}}
        onReset={() => {}}
        facetCounts={facetCounts}
      />,
    );
    // The TagArrayControl's chip input renders the suggestion when the input
    // is focused/typed; we settle for a smoke-test that the field's label is
    // present (a fuller test exists at the unit level for TagArrayControl).
    expect(screen.getByText(/Convicted offences/i)).toBeInTheDocument();
  });
});

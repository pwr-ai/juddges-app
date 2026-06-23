import { render, screen, fireEvent } from "@testing-library/react";
import { QuickFilters } from "@/components/search/QuickFilters";
import {
  QUICK_FILTER_CONFIGS,
  QUICK_FILTER_FIELDS,
  FILTER_FIELD_BY_NAME,
} from "@/lib/extractions/base-schema-filter-config";

describe("QuickFilters", () => {
  it("renders a label for every configured quick-filter field", () => {
    render(<QuickFilters filters={{}} onChange={() => {}} />);
    expect(screen.getByTestId("quick-filters")).toBeInTheDocument();
    for (const cfg of QUICK_FILTER_CONFIGS) {
      expect(screen.getAllByText(cfg.label).length).toBeGreaterThan(0);
    }
  });

  it("resolves the documented issue-#139 field set to real registry configs", () => {
    // Every configured quick field must exist in the registry and survive the
    // filter in QUICK_FILTER_CONFIGS (no silent drops from typos).
    for (const field of QUICK_FILTER_FIELDS) {
      expect(FILTER_FIELD_BY_NAME[field]).toBeDefined();
    }
    expect(QUICK_FILTER_CONFIGS).toHaveLength(QUICK_FILTER_FIELDS.length);
  });

  it("emits enum_multi onChange with the registry field key when toggled", () => {
    const onChange = jest.fn();
    render(<QuickFilters filters={{}} onChange={onChange} />);
    // appeal_outcome is an enum_multi quick filter; toggle its first option.
    const checkbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      "appeal_outcome",
      expect.objectContaining({ kind: "enum_multi" }),
    );
  });

  it("emits boolean_tri onChange for the confession quick filter", () => {
    const onChange = jest.fn();
    render(<QuickFilters filters={{}} onChange={onChange} />);
    // did_offender_confess is the only boolean_tri quick filter; its tri-state
    // renders Any/Yes/No buttons. Clicking "Yes" sets value true.
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onChange).toHaveBeenCalledWith(
      "did_offender_confess",
      expect.objectContaining({ kind: "boolean_tri", value: true }),
    );
  });

  it("reflects shared filter state passed in (same instance as the drawer)", () => {
    // A value selected elsewhere (e.g. the advanced drawer) must show here.
    render(
      <QuickFilters
        filters={{
          appeal_outcome: {
            kind: "enum_multi",
            values: ["outcome_dismissed_or_refused"],
          },
        }}
        onChange={() => {}}
      />,
    );
    const checked = screen
      .getAllByRole("checkbox")
      .filter((el) => (el as HTMLInputElement).checked);
    expect(checked.length).toBeGreaterThan(0);
  });

  it("emits date_range onChange for the appeal-judgment date quick filter", () => {
    const onChange = jest.fn();
    render(<QuickFilters filters={{}} onChange={onChange} />);
    const label = FILTER_FIELD_BY_NAME["date_of_appeal_court_judgment"]!.label;
    fireEvent.change(screen.getByLabelText(`${label} minimum`), {
      target: { value: "2020-01-01" },
    });
    expect(onChange).toHaveBeenCalledWith(
      "date_of_appeal_court_judgment",
      expect.objectContaining({ kind: "date_range" }),
    );
  });
});

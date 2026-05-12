import { render, screen, fireEvent } from "@testing-library/react";
import { TagArrayControl } from "@/components/search/controls/TagArrayControl";

describe("TagArrayControl", () => {
  it("renders suggestions from facetCounts when typing", () => {
    const onChange = jest.fn();
    render(
      <TagArrayControl
        label="Offences"
        value={undefined}
        onChange={onChange}
        facetCounts={{ theft: 120, fraud: 84, "frau-related": 5 }}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /offences/i }), { target: { value: "frau" } });
    expect(screen.getByText(/^fraud/)).toBeInTheDocument();
    expect(screen.getByText(/^frau-related/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/^fraud/));
    expect(onChange).toHaveBeenCalledWith({ kind: "tag_array", values: ["fraud"] });
  });
  it("removes a tag on chip click", () => {
    const onChange = jest.fn();
    render(
      <TagArrayControl
        label="Offences"
        value={{ kind: "tag_array", values: ["fraud", "theft"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove fraud/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "tag_array", values: ["theft"] });
  });
});

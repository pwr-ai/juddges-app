import { render, screen, fireEvent } from "@testing-library/react";
import { NumericRangeControl } from "@/components/search/controls/NumericRangeControl";

describe("NumericRangeControl", () => {
  it("emits the range on min change", () => {
    const onChange = jest.fn();
    render(<NumericRangeControl label="Victims" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith({ kind: "numeric_range", range: { min: 2 } });
  });
  it("clears with empty min when no max set", () => {
    const onChange = jest.fn();
    render(
      <NumericRangeControl
        label="Victims"
        value={{ kind: "numeric_range", range: { min: 2 } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
  it("keeps max when clearing min", () => {
    const onChange = jest.fn();
    render(
      <NumericRangeControl
        label="Victims"
        value={{ kind: "numeric_range", range: { min: 2, max: 5 } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ kind: "numeric_range", range: { max: 5 } });
  });
});

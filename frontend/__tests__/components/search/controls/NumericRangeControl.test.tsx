import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NumericRangeControl } from "@/components/search/controls/NumericRangeControl";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("NumericRangeControl", () => {
  it("emits the range on min change", () => {
    const onChange = jest.fn();
    renderWithClient(<NumericRangeControl label="Victims" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/victims minimum/i), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith({ kind: "numeric_range", range: { min: 2 } });
  });
  it("clears with empty min when no max set", () => {
    const onChange = jest.fn();
    renderWithClient(
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
    renderWithClient(
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

import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangeControl } from "@/components/search/controls/DateRangeControl";

describe("DateRangeControl", () => {
  it("converts ISO date input to epoch seconds (UTC midnight)", () => {
    const onChange = jest.fn();
    render(<DateRangeControl label="When" value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/when minimum/i), { target: { value: "2020-01-01" } });
    expect(onChange).toHaveBeenCalledWith({
      kind: "date_range",
      range: { min: Math.floor(Date.parse("2020-01-01T00:00:00Z") / 1000) },
    });
  });
  it("displays existing epoch seconds back as an ISO date", () => {
    const min = Math.floor(Date.parse("2020-06-15T00:00:00Z") / 1000);
    render(
      <DateRangeControl
        label="When"
        value={{ kind: "date_range", range: { min } }}
        onChange={() => {}}
      />,
    );
    expect((screen.getByLabelText(/when minimum/i) as HTMLInputElement).value).toBe("2020-06-15");
  });
});

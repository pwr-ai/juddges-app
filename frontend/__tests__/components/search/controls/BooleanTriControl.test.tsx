import { render, screen, fireEvent } from "@testing-library/react";
import { BooleanTriControl } from "@/components/search/controls/BooleanTriControl";

describe("BooleanTriControl", () => {
  it("toggles between Any / Yes / No", () => {
    const onChange = jest.fn();
    render(<BooleanTriControl label="Confessed" value={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "boolean_tri", value: true });
    fireEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "boolean_tri", value: false });
    fireEvent.click(screen.getByRole("button", { name: /^any$/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

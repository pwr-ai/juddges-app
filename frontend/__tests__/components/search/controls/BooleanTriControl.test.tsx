import { render, screen, fireEvent } from "@testing-library/react";
import { BooleanTriControl } from "@/components/search/controls/BooleanTriControl";

describe("BooleanTriControl", () => {
  it("keeps the same button elements across re-renders", () => {
    // The pill buttons were rendered by a component declared inside
    // BooleanTriControl's render body. That gave the component a new identity on
    // every render, so React unmounted and remounted the buttons instead of
    // updating them, discarding focus mid-interaction (#605).
    const onChange = jest.fn();
    const { rerender } = render(
      <BooleanTriControl label="Confessed" value={undefined} onChange={onChange} />
    );
    const before = screen.getByRole("button", { name: /^yes$/i });

    rerender(
      <BooleanTriControl
        label="Confessed"
        value={{ kind: "boolean_tri", value: true }}
        onChange={onChange}
      />
    );
    const after = screen.getByRole("button", { name: /^yes$/i });

    expect(after).toBe(before);
  });

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

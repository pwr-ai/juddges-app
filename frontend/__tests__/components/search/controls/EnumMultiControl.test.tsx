import { render, screen, fireEvent } from "@testing-library/react";
import { EnumMultiControl } from "@/components/search/controls/EnumMultiControl";

describe("EnumMultiControl", () => {
  it("toggles values and emits the next selection", () => {
    const onChange = jest.fn();
    render(
      <EnumMultiControl
        label="Appellant"
        options={["offender", "attorney_general", "other"]}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /offender/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "enum_multi", values: ["offender"] });
  });
  it("clearing the last value emits undefined", () => {
    const onChange = jest.fn();
    render(
      <EnumMultiControl
        label="Appellant"
        options={["offender"]}
        value={{ kind: "enum_multi", values: ["offender"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /offender/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

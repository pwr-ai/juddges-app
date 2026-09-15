import { render, screen } from "@testing-library/react";

import { SectionHeader } from "@/components/editorial/SectionHeader";

describe("SectionHeader (PWr)", () => {
  it("renders the numeral as a red square block", () => {
    render(<SectionHeader numeral="03" title="Capabilities" />);
    const numeral = screen.getByText("03");
    expect(numeral.className).toContain("bg-pwr-red");
    expect(numeral.className).toContain("text-pwr-paper");
    expect(numeral.className).not.toContain("italic");
  });

  it("bar variant wraps the title in the red bar", () => {
    const { container } = render(<SectionHeader variant="bar" eyebrow="Coverage" title="Two jurisdictions" />);
    expect(container.querySelector(".pwr-bar")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Two jurisdictions");
  });

  it("default variant has no bar", () => {
    const { container } = render(<SectionHeader title="Plain" />);
    expect(container.querySelector(".pwr-bar")).toBeNull();
  });
});

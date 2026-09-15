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

  it("bar variant renders the numeral as a white square with red text", () => {
    render(<SectionHeader variant="bar" numeral="02" title="Coverage" />);
    const numeral = screen.getByText("02");
    expect(numeral.className).toContain("bg-pwr-paper");
    expect(numeral.className).toContain("text-pwr-red");
  });

  it("default variant has no bar", () => {
    const { container } = render(<SectionHeader title="Plain" />);
    expect(container.querySelector(".pwr-bar")).toBeNull();
  });
});

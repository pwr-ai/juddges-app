import { render, screen } from "@testing-library/react";

import { Headline } from "@/components/editorial/Headline";

describe("Headline (Tenor Sans has no italic)", () => {
  it("ignores the italic prop — no italic class on the root element", () => {
    render(<Headline italic>x</Headline>);
    const el = screen.getByText("x");
    expect(el.className).not.toContain("italic");
  });
});

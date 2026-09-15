import { render, screen } from "@testing-library/react";

import { ChartFigure } from "@/components/editorial/ChartFigure";

describe("ChartFigure (title follows the display-headline rule)", () => {
  it("gives its title the editorial-display class", () => {
    render(
      <ChartFigure title={<>Where the <em>reasoning</em> comes from</>}>x</ChartFigure>,
    );
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("editorial-display");
  });

  it("renders a black top mark when featured", () => {
    const { container } = render(
      <ChartFigure featured title="x">y</ChartFigure>,
    );
    const mark = container.querySelector("span[aria-hidden]");
    expect(mark?.className).toContain("bg-pwr-black");
  });
});

import { render, screen } from "@testing-library/react";

import { ChartFigure } from "@/components/editorial/ChartFigure";

describe("ChartFigure (title follows the display-headline rule)", () => {
  it("gives its title the editorial-display class", () => {
    render(
      <ChartFigure title={<>Where the <em>reasoning</em> comes from</>}>x</ChartFigure>,
    );
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("editorial-display");
  });
});

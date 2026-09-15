import { render, screen } from "@testing-library/react";

import { Masthead } from "@/components/editorial/Masthead";

describe("Masthead (PWr red bar)", () => {
  it("renders badge and meta inside the red bar", () => {
    const { container } = render(<Masthead badge="Est. 2024 · Wrocław" meta="Vol I · No 1" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("pwr-bar");
    expect(screen.getByText("Est. 2024 · Wrocław")).toBeInTheDocument();
    expect(screen.getByText("Vol I · No 1").className).toContain("text-pwr-sand");
  });

  it("draws the nameplate underline only when ruled", () => {
    const ruled = render(<Masthead badge="A" ruled />).container.firstElementChild as HTMLElement;
    expect(ruled.className).toContain("border-b");
    const bare = render(<Masthead badge="A" ruled={false} />).container.firstElementChild as HTMLElement;
    expect(bare.className).not.toContain("border-b");
  });
});

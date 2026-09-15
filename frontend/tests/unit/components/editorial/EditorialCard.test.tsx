import { render, screen } from "@testing-library/react";

import { EditorialCard } from "@/components/editorial/EditorialCard";

describe("EditorialCard (title follows the display-headline rule)", () => {
  it("gives its title the editorial-display class", () => {
    render(<EditorialCard title="x" />);
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("editorial-display");
  });

  it("renders a black top mark when featured", () => {
    const { container } = render(<EditorialCard featured title="x" />);
    const mark = container.querySelector("span[aria-hidden]");
    expect(mark?.className).toContain("bg-pwr-black");
  });
});

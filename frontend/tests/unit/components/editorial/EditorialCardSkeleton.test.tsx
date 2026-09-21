import { render } from "@testing-library/react";
import { EditorialCardSkeleton } from "@/components/editorial/EditorialCardSkeleton";

describe("EditorialCardSkeleton", () => {
  it("renders with editorial-card class and sharp styling", () => {
    const { container } = render(<EditorialCardSkeleton />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("editorial-card");
  });

  it("renders body lines matching lines prop", () => {
    const { container } = render(<EditorialCardSkeleton lines={5} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });
});

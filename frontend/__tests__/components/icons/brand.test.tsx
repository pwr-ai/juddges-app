import { render } from "@testing-library/react";

import { GithubIcon, LinkedinIcon } from "@/components/icons/brand";

describe("brand icons", () => {
  // lucide-react v1 dropped every brand mark, so these are ours now (#593).
  // They have to keep behaving like the lucide icons they replaced, because
  // every call site still passes Tailwind sizing classes and expects the icon
  // to be hidden from screen readers unless it is labelled.
  it("renders at 24px with a currentColor stroke by default", () => {
    const { container } = render(<GithubIcon />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("fill", "none");
  });

  it("passes className through so Tailwind sizing still works", () => {
    const { container } = render(<LinkedinIcon className="size-4 text-primary" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveClass("size-4", "text-primary");
  });

  it("is hidden from assistive tech unless it is given a label", () => {
    const { container: plain } = render(<GithubIcon />);
    expect(plain.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const { container: labelled } = render(<GithubIcon aria-label="GitHub" />);
    const svg = labelled.querySelector("svg");
    expect(svg).not.toHaveAttribute("aria-hidden");
    expect(svg).toHaveAttribute("aria-label", "GitHub");
  });
});

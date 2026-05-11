import { render } from "@testing-library/react";
import { QueryHighlight } from "@/lib/styles/components/query-highlight";

describe("<QueryHighlight>", () => {
  it("renders serverHtml when provided (preferred path)", () => {
    const { container } = render(
      <QueryHighlight text="foo" serverHtml="<mark>foo</mark>" />
    );
    expect(container.querySelector("mark")?.textContent).toBe("foo");
  });

  it("falls back to client-side highlight when only query provided", () => {
    const { container } = render(
      <QueryHighlight text="the law" query="law" />
    );
    expect(container.querySelector("mark")?.textContent).toBe("law");
  });

  it("renders plain text when neither serverHtml nor query provided", () => {
    const { container } = render(<QueryHighlight text="plain" />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("plain");
  });

  it("renders plain text when serverHtml is empty string", () => {
    const { container } = render(
      <QueryHighlight text="plain" serverHtml="" query="" />
    );
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("plain");
  });

  it("sanitizes malicious tags in serverHtml", () => {
    const { container } = render(
      <QueryHighlight
        text="x"
        serverHtml='<script>alert(1)</script><mark>safe</mark>'
      />
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("safe");
  });

  it("respects the `as` prop", () => {
    const { container } = render(
      <QueryHighlight text="x" as="p" className="foo" />
    );
    const el = container.querySelector("p");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("foo");
  });

  it("renders empty when text and serverHtml are both null/empty", () => {
    const { container } = render(<QueryHighlight text={null} />);
    expect(container.textContent).toBe("");
  });
});

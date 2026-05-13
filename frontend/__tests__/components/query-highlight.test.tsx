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

  it("recenters serverHtml when ensureMarkVisible is true and the mark is far from the start", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot ".repeat(5);
    const { container } = render(
      <QueryHighlight
        text="ignored"
        serverHtml={`${longPrefix}<mark>match</mark> trailing`}
        ensureMarkVisible
      />
    );
    expect(container.querySelector("mark")?.textContent).toBe("match");
    // Without recentering, the <mark> lands hundreds of chars in; with it,
    // the mark must appear within the first ~80 chars of the rendered HTML.
    const innerHtml = container.innerHTML;
    const markIdx = innerHtml.indexOf("<mark>");
    expect(markIdx).toBeGreaterThan(0);
    expect(markIdx).toBeLessThan(80);
    expect(container.textContent?.startsWith("… ")).toBe(true);
  });

  it("does not recenter serverHtml when ensureMarkVisible is false (default)", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot ".repeat(5);
    const input = `${longPrefix}<mark>match</mark> trailing`;
    const { container } = render(
      <QueryHighlight text="ignored" serverHtml={input} />
    );
    // No leading ellipsis added — original prefix preserved.
    expect(container.textContent?.startsWith("alpha bravo")).toBe(true);
    expect(container.textContent?.startsWith("…")).toBe(false);
  });

  it("recenters client-side highlights when ensureMarkVisible is true", () => {
    const longPrefix = "alpha bravo charlie delta echo foxtrot ".repeat(5);
    const { container } = render(
      <QueryHighlight
        text={`${longPrefix}match trailing`}
        query="match"
        ensureMarkVisible
      />
    );
    expect(container.querySelector("mark")?.textContent).toBe("match");
    expect(container.textContent?.startsWith("… ")).toBe(true);
  });
});

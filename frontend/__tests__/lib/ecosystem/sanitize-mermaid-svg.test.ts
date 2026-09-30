import { sanitizeMermaidSvg } from "@/lib/ecosystem/sanitize-mermaid-svg";

const LABEL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="node"><g class="label"><rect></rect>' +
  '<foreignObject width="120" height="84"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell;">' +
  '<span class="nodeLabel"><p>Polish<br/>court <i>judgments</i></p></span></div></foreignObject></g></g></svg>';

function render(svg: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = sanitizeMermaidSvg(svg);
  const root = host.querySelector("svg");
  if (!root) throw new Error("sanitised output lost the <svg> root");
  return root;
}

describe("sanitizeMermaidSvg", () => {
  it("keeps the HTML line break and inline markup inside a foreignObject label (#747)", () => {
    const svg = render(LABEL_SVG);
    const label = svg.querySelector("foreignObject");

    expect(label?.querySelectorAll("br")).toHaveLength(1);
    expect(label?.querySelector("i")?.textContent).toBe("judgments");
    // What a reader sees: two lines, not "Polishcourt judgments".
    expect(label?.textContent).toBe("Polishcourt judgments");
    expect(label?.querySelector("p")?.childNodes[0].textContent).toBe("Polish");
    expect(label?.querySelector("p")?.childNodes[1].nodeName).toBe("BR");
  });

  it("still strips scripts, event handlers and javascript: URLs", () => {
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a>' +
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">' +
      '<img src="x" onerror="alert(1)"><script>alert(1)</script>ok</div></foreignObject></svg>';

    const out = sanitizeMermaidSvg(hostile);

    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onclick|onerror/i);
    expect(out).not.toMatch(/javascript:/i);
    // The harmless content survives, so the strip is targeted, not wholesale.
    expect(out).toContain("ok");
  });
});

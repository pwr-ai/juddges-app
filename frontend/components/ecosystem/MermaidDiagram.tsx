"use client";

import { useEffect, useId, useRef, useState } from "react";
import DOMPurify from "dompurify";

type Props = {
  chart: string;
  className?: string;
  ariaLabel?: string;
};

export function MermaidDiagram({ chart, className, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          flowchart: { curve: "basis", htmlLabels: true },
          themeVariables: {
            fontFamily: "inherit",
            primaryColor: "#eef2ff",
            primaryTextColor: "#1e293b",
            primaryBorderColor: "#6366f1",
            lineColor: "#94a3b8",
            secondaryColor: "#f1f5f9",
            tertiaryColor: "#fafafa",
          },
        });
        const id = `mermaid-${baseId}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        const sanitized = DOMPurify.sanitize(rendered, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["foreignObject"],
          ADD_ATTR: ["target", "xmlns"],
        });
        if (!cancelled) setSvg(sanitized);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to render diagram"
          );
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [chart, baseId]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not render diagram: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel ?? "Diagram"}
      className={className}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

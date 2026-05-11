"use client";

import React from "react";

import { highlightQueryInText, sanitizeHighlightHtml } from "@/lib/highlight";

export interface QueryHighlightProps {
  text: string | null | undefined;
  serverHtml?: string | null;
  query?: string | null;
  className?: string;
  as?: "span" | "p" | "div";
}

export function QueryHighlight({
  text,
  serverHtml,
  query,
  className,
  as = "span",
}: QueryHighlightProps): React.JSX.Element {
  const Tag = as;
  const html = resolveHtml(text, serverHtml, query);

  if (html == null) {
    return <Tag className={className}>{text ?? ""}</Tag>;
  }

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function resolveHtml(
  text: string | null | undefined,
  serverHtml: string | null | undefined,
  query: string | null | undefined
): string | null {
  if (serverHtml && serverHtml.trim()) {
    return sanitizeHighlightHtml(serverHtml);
  }
  if (text && query && query.trim()) {
    const out = highlightQueryInText(text, query);
    if (out.includes("<mark>")) return out;
  }
  return null;
}

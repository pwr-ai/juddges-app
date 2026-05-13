"use client";

import React from "react";

import {
  highlightQueryInText,
  recenterHighlightSnippet,
  sanitizeHighlightHtml,
} from "@/lib/highlight";

export interface QueryHighlightProps {
  text: string | null | undefined;
  serverHtml?: string | null;
  query?: string | null;
  className?: string;
  as?: "span" | "p" | "div";
  // Recenter the snippet so the first <mark> lands within the first lines of
  // the rendered text. Use this for containers that visually truncate
  // (e.g. CSS line-clamp), where the centered Meilisearch snippet would
  // otherwise hide the highlight past the clamp.
  ensureMarkVisible?: boolean;
}

export function QueryHighlight({
  text,
  serverHtml,
  query,
  className,
  as = "span",
  ensureMarkVisible = false,
}: QueryHighlightProps): React.JSX.Element {
  const Tag = as;
  const html = resolveHtml(text, serverHtml, query, ensureMarkVisible);

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
  query: string | null | undefined,
  ensureMarkVisible: boolean
): string | null {
  if (serverHtml && serverHtml.trim()) {
    const safe = sanitizeHighlightHtml(serverHtml);
    return ensureMarkVisible ? recenterHighlightSnippet(safe) : safe;
  }
  if (text && query && query.trim()) {
    const out = highlightQueryInText(text, query);
    if (out.includes("<mark>")) {
      return ensureMarkVisible ? recenterHighlightSnippet(out) : out;
    }
  }
  return null;
}

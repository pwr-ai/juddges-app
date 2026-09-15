import * as React from "react";
import { Toggle } from "@juddges/design-system";

const BoldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </svg>
);

const ItalicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" x2="10" y1="4" y2="4" />
    <line x1="14" x2="5" y1="20" y2="20" />
    <line x1="15" x2="9" y1="4" y2="20" />
  </svg>
);

const HighlightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 11-6 6v3h9l3-3" />
    <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
);

export const Default = () => (
  <Toggle aria-label="Toggle bold" defaultPressed>
    <BoldIcon />
  </Toggle>
);

export const Pressed = () => (
  <div className="flex items-center gap-2">
    <Toggle aria-label="Bold (off)">
      <BoldIcon />
    </Toggle>
    <Toggle aria-label="Bold (on)" defaultPressed>
      <BoldIcon />
    </Toggle>
    <Toggle aria-label="Italic (off)" variant="outline">
      <ItalicIcon />
    </Toggle>
    <Toggle aria-label="Italic (on)" variant="outline" defaultPressed>
      <ItalicIcon />
    </Toggle>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-2">
    <Toggle size="sm" variant="outline" defaultPressed>
      <HighlightIcon />
      Highlight
    </Toggle>
    <Toggle size="default" variant="outline" defaultPressed>
      <HighlightIcon />
      Highlight
    </Toggle>
    <Toggle size="lg" variant="outline" defaultPressed>
      <HighlightIcon />
      Highlight
    </Toggle>
  </div>
);

export const AnnotationToolbar = () => (
  <div className="inline-flex items-center gap-1 rounded-md border border-[color:var(--rule)] bg-[color:var(--parchment)] p-1">
    <Toggle aria-label="Bold" defaultPressed>
      <BoldIcon />
    </Toggle>
    <Toggle aria-label="Italic">
      <ItalicIcon />
    </Toggle>
    <Toggle aria-label="Highlight ratio decidendi">
      <HighlightIcon />
      Ratio
    </Toggle>
    <Toggle aria-label="Highlight obiter" disabled>
      <HighlightIcon />
      Obiter
    </Toggle>
  </div>
);

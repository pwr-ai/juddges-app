import * as React from "react";
import { Separator } from "@juddges/design-system";

export const Default = () => (
  <div className="max-w-sm">
    <p className="text-sm text-[color:var(--ink)]">Wyrok Sądu Apelacyjnego w Warszawie</p>
    <Separator className="my-3" />
    <p className="text-sm text-[color:var(--ink-soft)]">II AKa 412/22 · 14 marca 2023 r.</p>
  </div>
);

export const Vertical = () => (
  <div className="flex h-5 items-center gap-3 text-sm text-[color:var(--ink-soft)]">
    <span>Court of Appeal</span>
    <Separator orientation="vertical" />
    <span>[2023] EWCA Crim 281</span>
    <Separator orientation="vertical" />
    <span>21 Mar 2023</span>
    <Separator orientation="vertical" />
    <span className="font-mono text-xs uppercase tracking-[0.12em]">Criminal</span>
  </div>
);

export const InList = () => (
  <div className="max-w-sm">
    <div className="grid gap-1 py-2">
      <span className="text-sm font-medium text-[color:var(--ink)]">Ratio decidendi</span>
      <span className="text-xs text-[color:var(--ink-soft)]">Extracted from paragraphs 14–19</span>
    </div>
    <Separator />
    <div className="grid gap-1 py-2">
      <span className="text-sm font-medium text-[color:var(--ink)]">Obiter dicta</span>
      <span className="text-xs text-[color:var(--ink-soft)]">Extracted from paragraphs 22–23</span>
    </div>
    <Separator />
    <div className="grid gap-1 py-2">
      <span className="text-sm font-medium text-[color:var(--ink)]">Disposition</span>
      <span className="text-xs text-[color:var(--ink-soft)]">Appeal dismissed</span>
    </div>
  </div>
);

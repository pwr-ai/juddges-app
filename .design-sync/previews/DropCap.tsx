import * as React from "react";
import { DropCap } from "@juddges/design-system";

const LEDE =
  "The JuDDGES project reads judicial decisions the way a clerk would: it isolates the facts, the parties' submissions and the court's reasoning, and then records each strand in a structured form that can be searched and compared across thousands of judgments. Beginning with Polish common courts and the England and Wales Court of Appeal, the archive now spans more than fifty thousand decisions.";

const PL =
  "Sąd Apelacyjny we Wrocławiu, rozpoznając apelację oskarżonego od wyroku Sądu Okręgowego, uznał, że ocena dowodów dokonana przez sąd pierwszej instancji nie wykracza poza ramy swobodnej oceny, o której mowa w art. 7 k.p.k., a zarzuty apelacji stanowią jedynie polemikę z prawidłowymi ustaleniami faktycznymi.";

export const Default = () => (
  <div className="max-w-xl">
    <DropCap>{LEDE}</DropCap>
  </div>
);

export const Tones = () => (
  <div className="grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">oxblood</p>
      <DropCap tone="oxblood">{PL}</DropCap>
    </div>
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">ink</p>
      <DropCap tone="ink">{PL}</DropCap>
    </div>
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">gold</p>
      <DropCap tone="gold">{PL}</DropCap>
    </div>
  </div>
);

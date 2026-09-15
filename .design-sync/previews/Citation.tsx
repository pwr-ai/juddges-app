import * as React from "react";
import { Citation } from "@juddges/design-system";

export const InSentence = () => (
  <p className="max-w-xl text-[15px] leading-[1.65] text-ink">
    The corpus holds 47,000 judgments<Citation marker="¹" /> from Polish common
    courts and 6,050 decisions of the Court of Appeal (Criminal Division)
    <Citation marker="²" />, each paired with machine-extracted reasoning.
  </p>
);

export const Markers = () => (
  <ul className="flex flex-col gap-2 text-[15px] text-ink">
    <li>Superscript digit<Citation marker="¹" /></li>
    <li>Asterisk<Citation marker="*" /></li>
    <li>Dagger<Citation marker="†" /></li>
    <li>Double dagger<Citation marker="‡" /></li>
  </ul>
);

export const AutoIndexed = () => (
  <p className="max-w-xl text-[15px] leading-[1.65] text-ink">
    R v Jogee [2016] UKSC 8<Citation index={1} /> restated joint enterprise;
    the Court of Appeal applied it in R v Johnson [2016] EWCA Crim 1613
    <Citation index={2} /> and, two years later, in a run of twelve further
    appeals<Citation index={12} />.
  </p>
);

export const DefaultMarker = () => (
  <p className="text-[15px] text-ink">
    Wyrok SA w Krakowie, II AKa 145/22<Citation /> — no marker or index given, falls back to the asterisk.
  </p>
);

import * as React from "react";
import { Masthead } from "@juddges/design-system";

export const Default = () => (
  <Masthead badge="Est. 2024 · Wrocław" meta="Vol I · No 1" ruled />
);

export const Unruled = () => (
  <Masthead badge="Judicial Decision Data Gathering" meta="Spring 2026" ruled={false} />
);

export const BadgeOnly = () => <Masthead badge="Polish & E&W case law · open archive" />;

export const OverHero = () => (
  <div className="max-w-3xl">
    <Masthead badge="Est. 2024 · Wrocław" meta="Vol I · No 1" ruled />
    <h1 className="mt-8 editorial-display font-serif text-5xl leading-[1.05] tracking-[-0.01em] text-ink">
      An open archive of <em className="text-pwr-red">judicial reasoning</em>
    </h1>
  </div>
);

export const OnPanel = () => (
  <div className="bg-pwr-panel p-6">
    <Masthead badge="Politechnika Wrocławska · JuDDGES" meta="SIW 2025-12" ruled={false} />
  </div>
);

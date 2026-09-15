import * as React from "react";
import { QueryPill } from "@juddges/design-system";

export const Default = () => (
  <QueryPill href="/search?q=abuse+of+process">Abuse of process in criminal appeals</QueryPill>
);

export const WithLang = () => (
  <div className="flex flex-wrap gap-3">
    <QueryPill href="/search?q=frankowicze" lang="PL">
      Frankowicze i abuzywne klauzule
    </QueryPill>
    <QueryPill href="/search?q=joint+enterprise" lang="EN">
      Joint enterprise after Jogee
    </QueryPill>
  </div>
);

export const Row = () => (
  <div className="flex max-w-3xl flex-wrap gap-3">
    <QueryPill href="#" lang="PL">Warunkowe umorzenie postępowania</QueryPill>
    <QueryPill href="#" lang="PL">Obrona konieczna — art. 25 k.k.</QueryPill>
    <QueryPill href="#" lang="EN">Sentencing for aggravated burglary</QueryPill>
    <QueryPill href="#" lang="EN">Fresh evidence on appeal</QueryPill>
    <QueryPill href="#">Limitation periods in contract claims</QueryPill>
  </div>
);

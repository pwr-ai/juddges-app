import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@juddges/design-system";

export const Default = () => (
  <Card className="max-w-md">
    <CardHeader>
      <CardTitle>R v Ahmed [2023] EWCA Crim 281</CardTitle>
      <CardDescription>Court of Appeal (Criminal Division) · 21 March 2023</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm leading-relaxed text-[color:var(--ink-soft)]">
        Appeal against a sentence of 6 years' imprisonment for conspiracy to supply
        Class A drugs. The court considered whether the judge erred in placing the
        offending in category 2 of the Sentencing Council guideline.
      </p>
    </CardContent>
    <CardFooter className="gap-2">
      <Button size="sm">Open judgment</Button>
      <Button size="sm" variant="outline">Cite</Button>
    </CardFooter>
  </Card>
);

export const WithAction = () => (
  <Card className="max-w-md">
    <CardHeader>
      <CardTitle>Wyrok SA w Krakowie, II AKa 97/22</CardTitle>
      <CardDescription>Sąd Apelacyjny w Krakowie · 8 czerwca 2022 r.</CardDescription>
      <CardAction>
        <Badge variant="secondary">Criminal</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <dl className="grid gap-1.5 text-sm">
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-[color:var(--ink-soft)]">Judges</dt>
          <dd className="text-[color:var(--ink)]">SSA Tomasz Szymański (spr.), SSA Barbara Nita-Światłowska</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-[color:var(--ink-soft)]">Legal basis</dt>
          <dd className="text-[color:var(--ink)]">art. 148 § 1 k.k., art. 437 § 2 k.p.k.</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-24 shrink-0 text-[color:var(--ink-soft)]">Outcome</dt>
          <dd className="text-[color:var(--ink)]">Zaskarżony wyrok utrzymany w mocy</dd>
        </div>
      </dl>
    </CardContent>
  </Card>
);

export const HeaderOnly = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Saved searches</CardTitle>
      <CardDescription>12 queries across Polish and E&amp;W corpora</CardDescription>
    </CardHeader>
  </Card>
);

export const Grid = () => (
  <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
    <Card>
      <CardHeader>
        <CardDescription>Polish judgments</CardDescription>
        <CardTitle className="text-2xl tabular-nums">41,208</CardTitle>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader>
        <CardDescription>E&amp;W judgments</CardDescription>
        <CardTitle className="text-2xl tabular-nums">6,315</CardTitle>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader>
        <CardDescription>Extractions run</CardDescription>
        <CardTitle className="text-2xl tabular-nums">1,972</CardTitle>
      </CardHeader>
    </Card>
  </div>
);

import * as React from "react";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableCaption, Badge,
} from "@juddges/design-system";

const rows = [
  { ref: "II AKa 47/23", court: "SA Wrocław", date: "2023-03-14", type: "Criminal", outcome: "Sentence reduced" },
  { ref: "I ACa 812/22", court: "SA Warszawa", date: "2023-01-30", type: "Civil", outcome: "Appeal dismissed" },
  { ref: "III KK 112/21", court: "SN", date: "2022-11-08", type: "Criminal", outcome: "Cassation allowed" },
  { ref: "[2023] EWCA Crim 412", court: "EWCA (Crim)", date: "2023-04-21", type: "Criminal", outcome: "Sentence quashed" },
  { ref: "[2022] EWCA Civ 1157", court: "EWCA (Civ)", date: "2022-08-19", type: "Civil", outcome: "Appeal allowed" },
];

export const JudgmentList = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Reference</TableHead>
        <TableHead>Court</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Area</TableHead>
        <TableHead className="text-right">Outcome</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.ref}>
          <TableCell className="font-mono text-xs">{r.ref}</TableCell>
          <TableCell>{r.court}</TableCell>
          <TableCell className="font-mono text-xs tabular-nums">{r.date}</TableCell>
          <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
          <TableCell className="text-right">{r.outcome}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const WithCaption = () => (
  <Table>
    <TableCaption>Extracted fields for II AKa 47/23 — confidence per field.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Field</TableHead>
        <TableHead>Value</TableHead>
        <TableHead className="text-right">Confidence</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Presiding judge</TableCell>
        <TableCell>SSA Marek Kowalczyk</TableCell>
        <TableCell className="text-right font-mono tabular-nums">0.97</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Legal basis</TableCell>
        <TableCell>art. 278 § 1 k.k.</TableCell>
        <TableCell className="text-right font-mono tabular-nums">0.93</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Sentence</TableCell>
        <TableCell>2 years 6 months imprisonment</TableCell>
        <TableCell className="text-right font-mono tabular-nums">0.88</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);

export const SelectedRow = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Reference</TableHead>
        <TableHead>Court</TableHead>
        <TableHead className="text-right">Outcome</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.slice(0, 3).map((r, i) => (
        <TableRow key={r.ref} data-state={i === 1 ? "selected" : undefined}>
          <TableCell className="font-mono text-xs">{r.ref}</TableCell>
          <TableCell>{r.court}</TableCell>
          <TableCell className="text-right">{r.outcome}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const Compact = () => (
  <Table className="text-xs">
    <TableHeader>
      <TableRow>
        <TableHead className="h-8">Jurisdiction</TableHead>
        <TableHead className="h-8 text-right">Judgments</TableHead>
        <TableHead className="h-8 text-right">With reasoning</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="py-1.5">Poland — common courts</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">41,208</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">38,914</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="py-1.5">Poland — Supreme Court</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">2,341</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">2,297</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="py-1.5">England &amp; Wales — Court of Appeal</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">3,876</TableCell>
        <TableCell className="py-1.5 text-right font-mono tabular-nums">3,876</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);

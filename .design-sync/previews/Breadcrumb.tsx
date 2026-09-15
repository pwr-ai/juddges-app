import * as React from "react";
import { Breadcrumb } from "@juddges/design-system";

export const JudgmentPath = () => (
  <Breadcrumb
    items={[
      { label: "Judgments", href: "/judgments" },
      { label: "Sąd Apelacyjny we Wrocławiu", href: "/judgments?court=sa-wroclaw" },
      { label: "II AKa 47/23" },
    ]}
  />
);

export const SingleLevel = () => <Breadcrumb items={[{ label: "Collections" }]} />;

export const DeepPath = () => (
  <Breadcrumb
    items={[
      { label: "England & Wales", href: "/judgments?jurisdiction=ew" },
      { label: "Court of Appeal", href: "/judgments?court=ewca" },
      { label: "Criminal Division", href: "/judgments?court=ewca-crim" },
      { label: "2023", href: "/judgments?court=ewca-crim&year=2023" },
      { label: "R v Okafor [2023] EWCA Crim 412" },
    ]}
  />
);

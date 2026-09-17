import * as React from "react";
import { FieldTypeBadge } from "@juddges/design-system";

export const Default = () => <FieldTypeBadge type="string" />;

export const Types = () => (
  <div className="flex flex-wrap items-center gap-2">
    <FieldTypeBadge type="string" />
    <FieldTypeBadge type="number" />
    <FieldTypeBadge type="boolean" />
    <FieldTypeBadge type="date" />
    <FieldTypeBadge type="enum" />
    <FieldTypeBadge type="array" />
    <FieldTypeBadge type="object" />
    <FieldTypeBadge type="court_ref" />
  </div>
);

export const AiCreated = () => (
  <div className="flex flex-wrap items-center gap-2">
    <FieldTypeBadge type="string" />
    <FieldTypeBadge type="string" isAiCreated />
    <FieldTypeBadge type="date" isAiCreated />
  </div>
);

export const NoIcon = () => (
  <div className="flex flex-wrap items-center gap-2">
    <FieldTypeBadge type="string" showIcon={false} />
    <FieldTypeBadge type="number" showIcon={false} />
    <FieldTypeBadge type="boolean" showIcon={false} isAiCreated />
  </div>
);

export const SchemaRow = () => (
  <ul className="max-w-md divide-y divide-[color:var(--rule)]">
    {[
      ["case_number", "string", false],
      ["judgment_date", "date", false],
      ["sentence_months", "integer", true],
      ["appeal_allowed", "boolean", true],
    ].map(([name, type, ai]) => (
      <li key={name as string} className="flex items-center justify-between gap-4 py-2">
        <span className="font-mono text-sm text-[color:var(--ink)]">{name as string}</span>
        <FieldTypeBadge type={type as string} isAiCreated={ai as boolean} />
      </li>
    ))}
  </ul>
);

import type { SearchDocument } from "@/types/search";
import type { ExportRow } from "@/lib/file-export";
import {
  BASE_FIELD_ORDER,
  EXTRACTION_FIELD_ORDER,
  FIELD_LABELS,
  formatValue,
} from "@/lib/document-fields";

export interface CollectionExportColumn {
  key: string;
  label: string;
}

/**
 * Column presets for collection export (issue #198). The picker on
 * `/collections/[id]` lets the user choose how much of the judgment field
 * surface to download:
 *  - `default`  — core bibliographic fields only (the historical export).
 *  - `full`     — core + UK base schema + structural/deep extraction columns.
 *  - `research` — core + deep-analysis research-value signals (no full base set).
 */
export type CollectionExportPreset = "default" | "full" | "research";

const STANDARD_COLUMNS: CollectionExportColumn[] = [
  { key: "document_id", label: "Document ID" },
  { key: "title", label: "Title" },
  { key: "date_issued", label: "Date issued" },
  { key: "country", label: "Country" },
  { key: "language", label: "Language" },
  { key: "court_name", label: "Court" },
  { key: "department_name", label: "Department" },
  { key: "document_number", label: "Document number" },
  { key: "issuing_body_name", label: "Issuing body" },
  { key: "issuing_body_type", label: "Issuing body type" },
  { key: "issuing_body_jurisdiction", label: "Issuing body jurisdiction" },
  { key: "presiding_judge", label: "Presiding judge" },
  { key: "judges", label: "Judges" },
  { key: "parties", label: "Parties" },
  { key: "outcome", label: "Outcome" },
  { key: "summary", label: "Summary" },
  { key: "thesis", label: "Thesis" },
  { key: "keywords", label: "Keywords" },
  { key: "legal_bases", label: "Legal bases" },
  { key: "legal_concepts", label: "Legal concepts" },
  { key: "legal_references", label: "Legal references" },
  { key: "extracted_legal_bases", label: "Extracted legal bases" },
  { key: "references", label: "References" },
  { key: "factual_state", label: "Factual state" },
  { key: "legal_state", label: "Legal state" },
  { key: "full_text", label: "Full text" },
  { key: "source_url", label: "Source URL" },
];

const BASE_COLUMNS: CollectionExportColumn[] = BASE_FIELD_ORDER.map((key) => ({
  key,
  label: FIELD_LABELS[key]?.label ?? key,
}));

const EXTRACTION_COLUMNS: CollectionExportColumn[] = EXTRACTION_FIELD_ORDER.map(
  (key) => ({
    key,
    label: FIELD_LABELS[key]?.label ?? key,
  })
);

/** Deep-analysis research-value signals surfaced in the "Research" preset. */
const RESEARCH_DEEP_KEYS = new Set<string>([
  "deep_complexity_score",
  "deep_factual_complexity",
  "deep_legal_complexity",
  "deep_reasoning_quality_score",
  "deep_legal_domains",
  "deep_reasoning_patterns",
  "deep_judicial_tone",
  "deep_precedential_value",
  "deep_research_value",
]);

const RESEARCH_COLUMNS: CollectionExportColumn[] = EXTRACTION_COLUMNS.filter(
  (col) => RESEARCH_DEEP_KEYS.has(col.key)
);

/**
 * Default preset == the historical fixed column set (core + full base schema),
 * preserved for backward compatibility with existing callers/tests.
 */
export const COLLECTION_EXPORT_COLUMNS: CollectionExportColumn[] = [
  ...STANDARD_COLUMNS,
  ...BASE_COLUMNS,
];

export const EXPORT_PRESET_COLUMNS: Record<
  CollectionExportPreset,
  CollectionExportColumn[]
> = {
  default: COLLECTION_EXPORT_COLUMNS,
  full: [...STANDARD_COLUMNS, ...BASE_COLUMNS, ...EXTRACTION_COLUMNS],
  research: [...STANDARD_COLUMNS, ...RESEARCH_COLUMNS],
};

export const EXPORT_PRESET_LABELS: Record<CollectionExportPreset, string> = {
  default: "Default",
  full: "Full",
  research: "Research",
};

export function getExportColumns(
  preset: CollectionExportPreset
): CollectionExportColumn[] {
  return EXPORT_PRESET_COLUMNS[preset] ?? COLLECTION_EXPORT_COLUMNS;
}

function joinArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (item === null || item === undefined) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") return JSON.stringify(item);
      return String(item);
    })
    .filter((s) => s.length > 0)
    .join("\n");
}

function formatLegalReferences(value: SearchDocument["legal_references"]): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((ref) => {
      const cite = ref.normalized_citation ? ` (${ref.normalized_citation})` : "";
      return `[${ref.ref_type}] ${ref.text}${cite}`;
    })
    .join("\n");
}

function formatLegalConcepts(value: SearchDocument["legal_concepts"]): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((c) => (c.concept_type ? `${c.concept_name} (${c.concept_type})` : c.concept_name))
    .join("\n");
}

function formatBaseCell(key: string, value: unknown): string {
  return formatValue(key, value) ?? "";
}

export function flattenDocumentForExport(doc: SearchDocument): ExportRow {
  const issuingBody = doc.issuing_body;
  const issuingBodyName =
    typeof issuingBody === "string"
      ? issuingBody
      : issuingBody?.name ?? "";
  const issuingBodyType =
    typeof issuingBody === "object" && issuingBody !== null ? issuingBody.type ?? "" : "";
  const issuingBodyJurisdiction =
    typeof issuingBody === "object" && issuingBody !== null
      ? issuingBody.jurisdiction ?? ""
      : "";

  const row: ExportRow = {
    document_id: doc.document_id ?? "",
    title: doc.title ?? "",
    date_issued: doc.date_issued ?? "",
    country: doc.country ?? "",
    language: doc.language ?? "",
    court_name: doc.court_name ?? "",
    department_name: doc.department_name ?? "",
    document_number: doc.document_number ?? "",
    issuing_body_name: issuingBodyName,
    issuing_body_type: issuingBodyType,
    issuing_body_jurisdiction: issuingBodyJurisdiction,
    presiding_judge: doc.presiding_judge ?? "",
    judges: joinArray(doc.judges),
    parties: doc.parties ?? "",
    outcome: doc.outcome ?? "",
    summary: doc.summary ?? "",
    thesis: doc.thesis ?? "",
    keywords: joinArray(doc.keywords),
    legal_bases: joinArray(doc.legal_bases),
    legal_concepts: formatLegalConcepts(doc.legal_concepts),
    legal_references: formatLegalReferences(doc.legal_references),
    extracted_legal_bases: doc.extracted_legal_bases ?? "",
    references: joinArray(doc.references),
    factual_state: doc.factual_state ?? "",
    legal_state: doc.legal_state ?? "",
    full_text: doc.full_text ?? "",
    source_url:
      doc.metadata?.source_url ??
      ((doc as unknown as { source_url?: string | null }).source_url ?? ""),
  };

  const baseFields = doc.base_fields ?? null;
  for (const col of BASE_COLUMNS) {
    const value = baseFields ? baseFields[col.key] : undefined;
    row[col.key] = formatBaseCell(col.key, value);
  }

  const extractionFields = doc.extraction_fields ?? null;
  for (const col of EXTRACTION_COLUMNS) {
    const value = extractionFields ? extractionFields[col.key] : undefined;
    row[col.key] = formatBaseCell(col.key, value);
  }

  return row;
}

/**
 * Project a fully-flattened row down to the keys of the chosen preset. Keeps
 * column order stable and only the selected fields, so the downloaded file
 * matches what the user picked.
 */
function projectRow(
  row: ExportRow,
  columns: CollectionExportColumn[]
): ExportRow {
  const projected: ExportRow = {};
  for (const col of columns) {
    projected[col.key] = row[col.key] ?? "";
  }
  return projected;
}

export function buildCollectionExportRows(
  docs: SearchDocument[],
  preset: CollectionExportPreset = "default"
): ExportRow[] {
  const columns = getExportColumns(preset);
  return docs.map((doc) => projectRow(flattenDocumentForExport(doc), columns));
}

export function buildExportFilename(collectionName: string): string {
  const slug =
    collectionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collection";
  const date = new Date().toISOString().split("T")[0];
  return `${slug}-${date}`;
}

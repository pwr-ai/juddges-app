import type { SearchDocument } from "@/types/search";
import type { ExportRow } from "@/lib/file-export";

export interface CollectionExportColumn {
  key: string;
  label: string;
}

export const COLLECTION_EXPORT_COLUMNS: CollectionExportColumn[] = [
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
  { key: "score", label: "Score" },
];

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

  return {
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
    source_url: doc.metadata?.source_url ?? "",
    score: doc.score ?? "",
  };
}

export function buildCollectionExportRows(docs: SearchDocument[]): ExportRow[] {
  return docs.map(flattenDocumentForExport);
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

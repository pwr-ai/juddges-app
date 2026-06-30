import { SearchDocument } from "@/types/search";

/**
 * Builds an error-placeholder {@link SearchDocument} used when a document fails
 * to load, so the UI can still render a row/card instead of staying blank.
 */
export function createErrorDocument(
  documentId: string,
  options: { isDatabaseError?: boolean } = {}
): SearchDocument {
  const { isDatabaseError = false } = options;
  return {
    document_id: documentId,
    document_type: 'error',
    summary: isDatabaseError
      ? "Source information cannot be loaded!"
      : "Document was not found!",
    ...(isDatabaseError && { _isDatabaseError: true }),
    title: null,
    date_issued: null,
    issuing_body: null,
    language: null,
    document_number: null,
    country: null,
    full_text: null,
    thesis: null,
    legal_references: null,
    legal_concepts: null,
    keywords: null,
    score: null,
    court_name: null,
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
  };
}

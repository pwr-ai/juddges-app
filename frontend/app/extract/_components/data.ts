import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import { logger } from "@/lib/logger";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { Collection, CollectionDocument, ExtractionJob, mapExtractionJobs } from "./types";
import { getExtractionErrorMessage } from "./error-utils";

/**
 * Fetch the user's collections. Throws with a user-facing message on failure.
 */
export async function fetchCollections(): Promise<Collection[]> {
  const collectionsResponse = await fetch('/api/collections');
  if (!collectionsResponse.ok) {
    let errorMessage = 'Failed to fetch collections';
    try {
      const errorData = await collectionsResponse.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Use default error message if parsing fails
    }
    throw new Error(errorMessage);
  }
  return collectionsResponse.json();
}

/**
 * Fetch the extraction schemas, normalizing paginated/non-paginated responses,
 * dropping schemas without ids, and de-duplicating by id. Throws with a
 * user-facing message on failure.
 */
export async function fetchSchemas(): Promise<ExtractionSchema[]> {
  const schemasResponse = await fetch('/api/schemas');
  if (!schemasResponse.ok) {
    let errorMessage = 'Failed to fetch schemas';
    try {
      const errorData = await schemasResponse.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
      logger.error('Schemas API error:', errorData);
    } catch {
      // Use default error message if parsing fails
    }
    throw new Error(errorMessage);
  }
  const schemasResponseData = await schemasResponse.json();
  // Handle both paginated and non-paginated responses
  const schemasData = Array.isArray(schemasResponseData)
    ? schemasResponseData
    : (schemasResponseData.data || []);
  // Filter out schemas without IDs and ensure unique IDs
  return (schemasData as ExtractionSchema[])
    .filter((schema) => schema.id)
    .filter((schema, index, self) =>
      index === self.findIndex((s) => s.id === schema.id)
    );
}

/**
 * Fetch the recent extraction jobs from the API and map them into the UI shape.
 * Returns `null` when the request was not ok (so callers can decide how to react)
 * and an empty array is never substituted for a failed response.
 */
export async function fetchRecentJobs(
  limit: number,
  includeIds: boolean
): Promise<ExtractionJob[] | null> {
  const jobsResponse = await fetch('/api/jobs');
  if (!jobsResponse.ok) {
    return null;
  }
  const jobsData = await jobsResponse.json();
  const jobs = jobsData.jobs || [];
  return mapExtractionJobs(jobs, limit, includeIds);
}

export interface SubmitExtractionParams {
  collectionId: string;
  schemaId: string;
  language: string;
  documentIds: string[];
}

export type SubmitExtractionResult =
  | { ok: true; jobId: string }
  | { ok: false; message: string };

/**
 * Submit an extraction request. Returns a discriminated result so the caller can
 * decide how to surface success/failure (toasts, state updates) while the
 * request building and error-message parsing live here.
 */
export async function submitExtraction(
  params: SubmitExtractionParams
): Promise<SubmitExtractionResult> {
  const requestBody: {
    collection_id: string;
    schema_id: string;
    extraction_context: string;
    language: string;
    document_ids?: string[];
  } = {
    collection_id: params.collectionId,
    schema_id: params.schemaId,
    extraction_context: 'Extract structured information from legal documents using the provided schema.',
    language: params.language
  };

  // Only include document_ids if specific documents are selected
  if (params.documentIds.length > 0) {
    requestBody.document_ids = params.documentIds;
  }

  const response = await fetch('/api/extractions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const message = await getExtractionErrorMessage(response);
    return { ok: false, message };
  }

  const data = await response.json();
  const { job_id } = data;

  if (!job_id) {
    logger.error("No job_id in response: ", data);
    return {
      ok: false,
      message: "The server did not return a valid job ID. Please try again or contact support.",
    };
  }

  return { ok: true, jobId: job_id };
}

/**
 * Fetch the documents belonging to a collection. Throws on a non-ok response.
 */
export async function fetchCollectionDocuments(
  collectionId: string
): Promise<CollectionDocument[]> {
  const response = await fetch(`/api/collections/${collectionId}/documents`);

  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }

  return response.json();
}

/**
 * Save an AI-generated schema to the database and return the saved schema.
 * Throws on a non-ok response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveGeneratedSchema(newSchema: any): Promise<ExtractionSchema> {
  const schemaToSave = {
    name: newSchema.name || `Generated Schema ${Date.now()}`,
    description: newSchema.description || "AI-generated extraction schema",
    type: "generated",
    category: "ai-generated",
    text: newSchema.schema || newSchema,
    dates: {}
  };

  const response = await fetch('/api/schemas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(schemaToSave)
  });

  if (!response.ok) {
    throw new Error(`Failed to save schema: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch document_type / document_number metadata for the given documents via the
 * batch endpoint and merge it into the supplied documents. On any failure the
 * original documents are returned unchanged (best-effort enrichment).
 */
export async function enrichDocumentsWithMetadata(
  documents: CollectionDocument[]
): Promise<CollectionDocument[]> {
  // Normalize document IDs by removing /doc/ prefix if present (some judgments have this prefix)
  const documentIds = documents.map((doc: CollectionDocument) => cleanDocumentIdForUrl(doc.document_id));

  try {
    const metadataResponse = await fetch('/api/documents/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_ids: documentIds,
        return_vectors: false,
        return_properties: ['document_id', 'document_type', 'document_number'],
      }),
    });

    if (metadataResponse.ok) {
      const metadataData = await metadataResponse.json();

      if (metadataData.documents && Array.isArray(metadataData.documents)) {
        const metadataMap = new Map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadataData.documents.map((doc: any) => {
            // Normalize document_id for matching (remove /doc/ prefix if present)
            const normalizedDocId = cleanDocumentIdForUrl(doc.document_id);
            return [
              normalizedDocId,
              {
                document_type: doc.document_type || null,
                docket_number: doc.document_number || null, // document_number from API becomes docket_number
                document_number: doc.document_number || null, // Keep document_number as fallback
              },
            ];
          })
        );

        // Merge metadata with documents (normalize document_id for matching)
        return documents.map((doc: CollectionDocument) => {
          const normalizedDocId = cleanDocumentIdForUrl(doc.document_id);
          return {
            ...doc,
            ...(metadataMap.get(normalizedDocId) || {}),
          };
        });
      } else {
        logger.warn('Invalid metadata response format:', metadataData);
        // Continue with documents without metadata
      }
    } else {
      logger.warn('Failed to fetch document metadata:', { status: metadataResponse.status, body: await metadataResponse.text().catch(() => '') });
      // Continue with documents without metadata
    }
  } catch (metadataError) {
    logger.warn('Failed to fetch document metadata:', metadataError);
    // Continue with documents without metadata
  }

  return documents;
}

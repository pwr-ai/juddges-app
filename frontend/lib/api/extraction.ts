import { apiLogger } from './client';

// Bulk extraction

export interface BulkExtractionJobInfo {
  job_id: string;
  schema_id: string;
  schema_name: string | null;
  status: string;
}

export interface BulkExtractionInput {
  collection_id: string;
  schema_ids: string[];
  document_ids?: string[];
  extraction_context?: string;
  language?: string;
  auto_export?: boolean;
  scheduled_at?: string;
}

export interface BulkExtractionResponse {
  bulk_id: string;
  status: 'accepted' | 'scheduled' | 'rejected';
  jobs: BulkExtractionJobInfo[];
  total_schemas: number;
  total_documents: number;
  auto_export: boolean;
  scheduled_at: string | null;
  message: string | null;
}

export async function submitBulkExtraction(
  input: BulkExtractionInput
): Promise<BulkExtractionResponse> {
  apiLogger.info('submitBulkExtraction called', {
    collectionId: input.collection_id,
    schemaIds: input.schema_ids,
    documentCount: input.document_ids?.length,
    autoExport: input.auto_export,
  });

  const response = await fetch(`/api/extractions/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to start bulk extraction' }));
    apiLogger.error('Bulk extraction API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to start bulk extraction. Please try again.');
  }

  const result = await response.json();
  apiLogger.info('submitBulkExtraction response', {
    bulkId: result.bulk_id,
    status: result.status,
    jobCount: result.jobs?.length,
  });

  return result;
}

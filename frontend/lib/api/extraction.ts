import { apiLogger } from './client';
import type {
  VersionHistoryResponse,
  VersionDetailResponse,
  VersionDiffResponse,
  CreateVersionInput,
  RevertVersionResponse,
  RevertVersionInput,
  DocumentVersion,
} from '@/types/versioning';

export type {
  VersionHistoryResponse,
  VersionDetailResponse,
  VersionDiffResponse,
  DocumentVersion,
  RevertVersionResponse,
};

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

// Document Versioning

export async function getVersionHistory(
  documentId: string,
  options?: { limit?: number; offset?: number }
): Promise<VersionHistoryResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const url = `/api/documents/${documentId}/versions${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch version history. Please try again.');
  }

  return await response.json();
}

export async function getVersionDetail(
  documentId: string,
  versionNumber: number
): Promise<VersionDetailResponse> {
  const response = await fetch(`/api/documents/${documentId}/versions/${versionNumber}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch version detail. Please try again.');
  }

  return await response.json();
}

export async function getVersionDiff(
  documentId: string,
  fromVersion: number,
  toVersion: number
): Promise<VersionDiffResponse> {
  const response = await fetch(
    `/api/documents/${documentId}/versions/diff?from=${fromVersion}&to=${toVersion}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate version diff. Please try again.');
  }

  return await response.json();
}

export async function createVersionSnapshot(
  documentId: string,
  input?: CreateVersionInput
): Promise<DocumentVersion> {
  const response = await fetch(`/api/documents/${documentId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input || {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create version' }));
    throw new Error(errorData.message || 'Failed to create version snapshot. Please try again.');
  }

  return await response.json();
}

export async function revertToVersion(
  documentId: string,
  input: RevertVersionInput
): Promise<RevertVersionResponse> {
  const response = await fetch(`/api/documents/${documentId}/versions/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to revert version' }));
    throw new Error(errorData.message || 'Failed to revert to version. Please try again.');
  }

  return await response.json();
}

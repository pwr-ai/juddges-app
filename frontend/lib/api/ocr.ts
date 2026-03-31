import { apiLogger } from './client';

export interface OCRQualityMetrics {
  avg_confidence: number;
  low_confidence_words: number;
  total_words: number;
  estimated_accuracy: number;
  needs_review: boolean;
  quality_level: 'high' | 'medium' | 'low';
}

export interface OCRPageResult {
  page_number: number;
  extracted_text: string;
  confidence_score: number;
  word_count: number;
  quality_metrics: OCRQualityMetrics | null;
}

export interface OCRJobResponse {
  job_id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string | null;
}

export interface OCRJobStatus {
  job_id: string;
  document_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source_type: string;
  source_filename: string | null;
  extracted_text: string | null;
  confidence_score: number | null;
  page_count: number | null;
  language_detected: string | null;
  quality_metrics: OCRQualityMetrics | null;
  pages: OCRPageResult[] | null;
  corrected_text: string | null;
  correction_notes: string | null;
  corrected_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface OCRJobListResponse {
  jobs: OCRJobStatus[];
  total: number;
  page: number;
  page_size: number;
}

export interface OCRCorrectionInput {
  corrected_text: string;
  correction_notes?: string;
  page_corrections?: Array<{ page_number: number; corrected_text: string }>;
}

export interface OCRCorrectionResponse {
  job_id: string;
  status: 'corrected';
  corrected_at: string;
  message: string;
}

export async function submitOCRFile(
  file: File,
  documentId: string,
  sourceType: 'pdf' | 'image',
  languageHint?: string,
): Promise<OCRJobResponse> {
  apiLogger.info('submitOCRFile called', {
    fileName: file.name,
    fileSize: file.size,
    documentId,
    sourceType,
  });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_id', documentId);
  formData.append('source_type', sourceType);
  if (languageHint) {
    formData.append('language_hint', languageHint);
  }

  const response = await fetch('/api/ocr/jobs', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit OCR job' }));
    apiLogger.error('OCR submit API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit OCR job. Please try again.');
  }

  return await response.json();
}

export async function submitOCRText(
  documentId: string,
  sourceType: 'pdf' | 'image',
  sourceFilename?: string,
  languageHint?: string,
): Promise<OCRJobResponse> {
  apiLogger.info('submitOCRText called', { documentId, sourceType });

  const response = await fetch('/api/ocr/jobs/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_id: documentId,
      source_type: sourceType,
      source_filename: sourceFilename,
      language_hint: languageHint,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit OCR text job' }));
    apiLogger.error('OCR text submit API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit OCR text job. Please try again.');
  }

  return await response.json();
}

export async function getOCRJobStatus(jobId: string): Promise<OCRJobStatus> {
  const response = await fetch(`/api/ocr/jobs/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch OCR job status. Please try again.');
  }

  return await response.json();
}

export async function listOCRJobs(
  options?: { documentId?: string; status?: string; page?: number; pageSize?: number }
): Promise<OCRJobListResponse> {
  const params = new URLSearchParams();
  if (options?.documentId) params.set('document_id', options.documentId);
  if (options?.status) params.set('status', options.status);
  if (options?.page) params.set('page', options.page.toString());
  if (options?.pageSize) params.set('page_size', options.pageSize.toString());

  const url = `/api/ocr/jobs${params.toString() ? '?' + params.toString() : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to list OCR jobs. Please try again.');
  }

  return await response.json();
}

export async function submitOCRCorrection(
  jobId: string,
  input: OCRCorrectionInput,
): Promise<OCRCorrectionResponse> {
  apiLogger.info('submitOCRCorrection called', { jobId });

  const response = await fetch(`/api/ocr/jobs/${jobId}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit corrections' }));
    apiLogger.error('OCR correction API error:', response.status, errorData);
    throw new Error(errorData.error || 'Failed to submit corrections. Please try again.');
  }

  return await response.json();
}

export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  documents?: { id: string }[] | null;
  document_count?: number | null;
}

export interface CollectionDocument {
  id: string;
  document_id: string;
  document_date: string | null;
  volume_number: number;
  title?: string | null;
  document_title?: string | null;
  document_number?: string | null;
  docket_number?: string | null;
  document_type?: string | null;
}

export interface ExtractionResult {
  document_id: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error_message?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data?: any;
  documents?: {
    document_id: string;
    document_date: string;
    volume_number: number;
  };
}

export interface ExtractionJob {
  id: string;
  collection_id?: string | null;
  collection_name: string;
  schema_id?: string | null;
  schema_name: string;
  document_count: number;
  status: 'completed' | 'failed' | 'in_progress';
  created_at: string;
  completed_at?: string;
  completed_documents?: number;
  estimated_time_remaining_seconds?: number | null;
}

const documentTypeBadgeStyles: Record<string, string> = {
  judgment: "bg-blue-400/8 text-blue-800 border border-blue-400/15 shadow-sm shadow-blue-400/5",
  default: "bg-slate-200/40 text-slate-700 border border-slate-200/30",
};

const formatDocumentTypeLabel = (type: string) =>
  type
    .replace(/_/g, "")
    .split("")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

// Convert names to human-readable format (sentence case)
export const formatName = (name: string): string => {
  // Handle snake_case: replace underscores with spaces
  let formatted = name.replace(/_/g, ' ');

  // Handle camelCase: insert space before capital letters
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Split into words
  const words = formatted.split(/\s+/).map(w => w.toLowerCase());

  // Capitalize only the first word
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  return words.join(' ');
};

export const getDocumentTypeBadge = (type?: string | null) => {
  if (!type) {
    return { label: "Legal Document", className: documentTypeBadgeStyles.default };
  }

  const normalized = type.toLowerCase().trim();

  // Check for judgment variations
  if (normalized === "judgment" || normalized === "judgement" || normalized.includes("judgment")) {
    return {
      label: "Judgment",
      className: documentTypeBadgeStyles.judgment,
    };
  }

  // Fallback to formatted label
  return {
    label: formatDocumentTypeLabel(type),
    className: documentTypeBadgeStyles.default,
  };
};

/**
 * Normalize a raw status string from the API into one of the three
 * UI status values.
 */
const normalizeJobStatus = (rawStatus: unknown): ExtractionJob['status'] => {
  const normalizedStatus = (rawStatus as string)?.toUpperCase().trim() || '';
  let status: ExtractionJob['status'] = 'in_progress';

  if (normalizedStatus === 'SUCCESS' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'PARTIALLY_COMPLETED') {
    status = 'completed';
  } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'FAILURE' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'REVOKED') {
    status = 'failed';
  } else if (normalizedStatus === 'PROCESSING' || normalizedStatus === 'STARTED' || normalizedStatus === 'PENDING') {
    status = 'in_progress';
  }

  return status;
};

/**
 * Map raw API job objects into the UI's ExtractionJob shape.
 *
 * @param jobs       Raw job array from the API.
 * @param limit      Maximum number of jobs to keep.
 * @param includeIds When true, also carries collection_id/schema_id/schema_name
 *                   through (matches the initial-load mapping); otherwise those
 *                   id fields are omitted (matches the poll/refresh mapping).
 */
export const mapExtractionJobs = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs: any[],
  limit: number,
  includeIds: boolean
): ExtractionJob[] =>
  jobs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((job: any) => job.collection_name && job.schema_name)
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((job: any) => {
      const status = normalizeJobStatus(job.status);

      return {
        id: job.job_id || job.id || '',
        ...(includeIds ? { collection_id: job.collection_id || null } : {}),
        collection_name: job.collection_name || 'Unknown Collection',
        ...(includeIds ? { schema_id: job.schema_id || null } : {}),
        schema_name: job.schema_name || 'Unknown Schema',
        document_count: job.total_documents || 0,
        status,
        created_at: job.created_at || new Date().toISOString(),
        completed_at: job.completed_at || undefined,
        completed_documents: job.completed_documents || 0,
        estimated_time_remaining_seconds: job.estimated_time_remaining_seconds || null,
      };
    });

// Format time from seconds to human-readable format
export const formatTimeFromSeconds = (seconds: number): string => {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
};

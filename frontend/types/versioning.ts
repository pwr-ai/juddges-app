export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  title: string | null;
  content_hash: string;
  change_description: string | null;
  change_type: 'initial' | 'amendment' | 'correction' | 'consolidation' | 'repeal';
  created_by: string;
  created_at: string;
  has_extracted_data: boolean;
}

export interface VersionHistoryResponse {
  document_id: string;
  current_version: number;
  versions: DocumentVersion[];
  total_versions: number;
}

export interface VersionDetailResponse {
  id: string;
  document_id: string;
  version_number: number;
  title: string | null;
  full_text: string;
  summary: string | null;
  content_hash: string;
  change_description: string | null;
  change_type: string;
  created_by: string;
  created_at: string;
  extracted_data: Record<string, unknown>;
}

export interface VersionDiffResponse {
  document_id: string;
  from_version: number;
  to_version: number;
  diff_html: string;
  diff_stats: {
    additions: number;
    deletions: number;
    total_changes: number;
  };
  from_title: string | null;
  to_title: string | null;
  from_created_at: string | null;
  to_created_at: string | null;
}

export interface CreateVersionInput {
  change_description?: string;
  change_type?: 'initial' | 'amendment' | 'correction' | 'consolidation' | 'repeal';
}

export interface RevertVersionInput {
  version_number: number;
  change_description?: string;
}

export interface RevertVersionResponse {
  document_id: string;
  reverted_to_version: number;
  new_current_version: number;
  pre_revert_snapshot_version: number;
  message: string;
}

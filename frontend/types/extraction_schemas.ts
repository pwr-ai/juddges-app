export type SchemaStatus = 'draft' | 'published' | 'review' | 'archived';

export interface ExtractionSchema {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  text: Record<string, any>; // JSONB field containing the schema definition
  dates: {
    [key: string]: string;
  };
  status: SchemaStatus | null;
  is_verified: boolean;
  field_count?: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  user?: {
    email: string;
  };
  // AI generation context fields
  extraction_instructions?: string;
  generated_prompt?: string;
}

export interface CreateExtractionSchema {
  name: string;
  description: string;
  type: string;
  category: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  text: Record<string, any>;
  dates: {
    [key: string]: string;
  };
  status?: SchemaStatus;
  is_verified?: boolean;
  user_id?: string;
  // AI generation context fields
  extraction_instructions?: string;
  generated_prompt?: string;
}

export interface UpdateExtractionSchema {
  name?: string;
  description?: string;
  type?: string;
  category?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  text?: Record<string, any>;
  dates?: {
    [key: string]: string;
  };
  status?: SchemaStatus;
  is_verified?: boolean;
  // AI generation context fields
  extraction_instructions?: string;
  generated_prompt?: string;
}

export interface Document {
  id: string;
  document_id: string;
  judgment_date: string;
  volume_number: string;
}

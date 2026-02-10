export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CollectionDocument {
  collection_id: number;
  document_id: number;
}

export interface CollectionWithDocuments extends Collection {
  documents: number[]; // Array of document IDs
  document_count?: number; // Total count of documents in collection (may not be present on newly created collections)
} 
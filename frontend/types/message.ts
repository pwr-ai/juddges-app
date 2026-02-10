export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  document_ids?: string[] // Array of document IDs used as sources
  created_at?: string
}


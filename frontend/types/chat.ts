export interface Chat {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  firstMessage?: string | null;
}

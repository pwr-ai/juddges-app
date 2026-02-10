export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  featured_image?: string;
  author: {
    name: string;
    avatar?: string;
    title?: string;
  };
  status: "published" | "draft" | "scheduled";
  published_at?: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  category: string;
  read_time?: number; // in minutes
  views?: number;
  likes?: number;
  ai_summary?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color: string; // Tailwind color class
  icon?: string;
}

import { useQuery } from "@tanstack/react-query";

export interface DashboardStats {
  total_judgments: number;
  jurisdictions: { PL: number; UK: number };
  court_levels: { name: string; count: number; jurisdiction?: string }[];
  top_courts: { name: string; count: number; jurisdiction?: string }[];
  decisions_per_year: { year: number; count: number }[] | null;
  date_range: { oldest: string | null; newest: string | null } | null;
  case_types: { name: string; count: number }[];
  data_completeness: {
    embeddings_pct: number;
    structure_extraction_pct: number;
    deep_analysis_pct: number;
    with_summary_pct: number;
    with_keywords_pct: number;
    with_legal_topics_pct: number;
    with_cited_legislation_pct: number;
    avg_text_length_chars: number;
  };
  // Retained for UI back-compat (stats-card-v1.tsx); always null until
  // legal-domain extraction coverage improves.
  top_legal_domains: { name: string; count: number }[] | null;
  top_keywords: { name: string; count: number }[];
  computed_at: string | null;
}

interface Document {
  id: string;
  document_id?: string;
  title?: string;
  document_number?: string;
  document_type: string;
  publication_date?: string | null;
  ai_summary?: string | null;
  key_topics?: string[] | null;
  jurisdiction?: string | null;
  language: string;
}

interface TrendingTopic {
  topic: string;
  change: string;
  trend: "up" | "down" | "stable";
  query_count: number;
  category: string;
}

interface Chat {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  firstMessage?: string | null;
}

/**
 * Hook to fetch dashboard statistics with React Query caching
 *
 * Caches for 4 hours to match backend TTL
 */
export function useDashboardStats(): ReturnType<typeof useQuery<DashboardStats>> {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async (): Promise<DashboardStats> => {
      const response = await fetch("/api/dashboard/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      return response.json();
    },
    staleTime: 4 * 60 * 60 * 1000, // 4 hours
  });
}

/**
 * Hook to fetch recent documents with React Query caching
 *
 * Minimal caching to ensure fresh data from backend
 */
export function useRecentDocuments(limit: number = 5): ReturnType<typeof useQuery<Document[]>> {
  return useQuery({
    queryKey: ["dashboard", "recent-documents", limit],
    queryFn: async (): Promise<Document[]> => {
      const response = await fetch(
        `/api/dashboard/recent-documents?limit=${limit}`,
        {
          cache: 'no-store', // Disable fetch cache
        }
      );
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    staleTime: 0, // No caching - always fetch fresh data
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes after unmount
  });
}

/**
 * Hook to fetch trending topics with React Query caching
 *
 * Caches for 1 hour - trending data doesn't need to be real-time
 */
export function useTrendingTopics(limit: number = 3) {
  return useQuery({
    queryKey: ["dashboard", "trending-topics", limit],
    queryFn: async (): Promise<TrendingTopic[]> => {
      const response = await fetch(
        `/api/dashboard/trending-topics?limit=${limit}`
      );
      if (!response.ok) throw new Error("Failed to fetch trends");
      return response.json();
    },
    staleTime: 1 * 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Hook to fetch recent chats with React Query caching
 *
 * Caches for 5 minutes to ensure relatively fresh data
 */
export function useRecentChats(limit: number = 5) {
  return useQuery({
    queryKey: ["dashboard", "recent-chats", limit],
    queryFn: async (): Promise<Chat[]> => {
      const response = await fetch(
        `/api/chats?limit=${limit}`,
        {
          cache: 'no-store', // Disable fetch cache
        }
      );
      if (!response.ok) throw new Error("Failed to fetch chats");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes after unmount
  });
}

interface Schema {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  type: string;
  status?: 'draft' | 'published' | 'review' | 'archived' | null;
  is_verified?: boolean | null;
  created_at: string;
  updated_at: string;
}

interface Collection {
  id: string;
  name: string;
  documents: Array<{ id: string }>;
}

interface ExtractionJob {
  job_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

/**
 * Hook to fetch user's generated schemas with React Query caching
 */
export function useUserSchemas(limit: number = 5) {
  return useQuery({
    queryKey: ["dashboard", "user-schemas", limit],
    queryFn: async (): Promise<Schema[]> => {
      const response = await fetch("/api/schemas", {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error("Failed to fetch schemas");
      const schemas = await response.json();
      // Schemas from API should already be filtered by user, but limit the results
      return (schemas || []).slice(0, limit);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

interface CollectionsInfo {
  documentCount: number;
  collectionCount: number;
}

/**
 * Hook to fetch collections and calculate total document count and collection count
 */
export function useCollectionsDocumentCount() {
  return useQuery({
    queryKey: ["dashboard", "collections-document-count"],
    queryFn: async (): Promise<CollectionsInfo> => {
      const response = await fetch("/api/collections", {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error("Failed to fetch collections");
      const collections: Collection[] = await response.json();
      // Sum up all documents across all collections
      const documentCount = collections.reduce((sum, collection) => {
        return sum + (collection.documents?.length || 0);
      }, 0);
      return {
        documentCount,
        collectionCount: collections.length,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch recent extraction jobs with React Query caching
 */
export function useRecentExtractions(limit: number = 3) {
  return useQuery({
    queryKey: ["dashboard", "recent-extractions", limit],
    queryFn: async (): Promise<ExtractionJob[]> => {
      const response = await fetch("/api/jobs", {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error("Failed to fetch extraction jobs");
      const data = await response.json();
      return (data.jobs || []).slice(0, limit);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

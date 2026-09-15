import { useQuery } from "@tanstack/react-query";
import { getCollections } from "@/lib/api/collections";
import {
  getUserSearchHistory,
  type UserSearchHistoryItem,
} from "@/lib/api/search-history";

export interface DashboardStats {
  total_judgments: number;
  jurisdictions: { PL: number; UK: number };
  court_levels: { name: string; count: number; jurisdiction?: string }[];
  top_courts: { name: string; count: number; jurisdiction?: string }[];
  decisions_per_year: { year: number; count: number }[] | null;
  decisions_per_year_by_jurisdiction: {
    year: number;
    count: number;
    jurisdiction: "PL" | "UK";
  }[];
  date_range: { oldest: string | null; newest: string | null } | null;
  case_types: { name: string; count: number }[];
  decision_types: { name: string; count: number }[];
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

export interface DashboardRecentCollection {
  id: string;
  name: string;
  documentCount: number;
  updatedAt: string;
}

export interface DashboardResearchActivity {
  documentCount: number;
  collectionCount: number;
  recentCollections: DashboardRecentCollection[];
  recentSearches: UserSearchHistoryItem[];
  collectionsUnavailable: boolean;
  searchesUnavailable: boolean;
}

export const dashboardResearchActivityQueryKey = (userId: string | undefined) =>
  ["dashboard", "research-activity", userId] as const;

/**
 * Fetches the user's latest research entry points for the dashboard. Each source
 * can fail independently so a history outage does not hide collections, and vice
 * versa.
 */
export async function fetchDashboardResearchActivity(): Promise<DashboardResearchActivity> {
  const [collectionsResult, searchesResult] = await Promise.allSettled([
    getCollections(),
    getUserSearchHistory(30, 3),
  ]);

  if (
    collectionsResult.status === "rejected" &&
    searchesResult.status === "rejected"
  ) {
    throw new Error("Failed to fetch dashboard research activity");
  }

  const collections =
    collectionsResult.status === "fulfilled" ? collectionsResult.value : [];
  const recentSearches =
    searchesResult.status === "fulfilled" ? searchesResult.value : [];
  const documentCount = collections.reduce((sum, collection) => {
    return sum + (collection.document_count ?? collection.documents?.length ?? 0);
  }, 0);
  const collectionsByRecentActivity = [...collections].sort((left, right) => {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });

  return {
    documentCount,
    collectionCount: collections.length,
    recentCollections: collectionsByRecentActivity.slice(0, 3).map((collection) => ({
      id: collection.id,
      name: collection.name,
      documentCount:
        collection.document_count ?? collection.documents?.length ?? 0,
      updatedAt: collection.updated_at,
    })),
    recentSearches: recentSearches.slice(0, 3),
    collectionsUnavailable: collectionsResult.status === "rejected",
    searchesUnavailable: searchesResult.status === "rejected",
  };
}

export function useDashboardResearchActivity(userId?: string): ReturnType<
  typeof useQuery<DashboardResearchActivity>
> {
  return useQuery({
    queryKey: dashboardResearchActivityQueryKey(userId),
    queryFn: fetchDashboardResearchActivity,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

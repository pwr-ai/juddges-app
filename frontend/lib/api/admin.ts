import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8004";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStats {
  total_users: number;
  total_documents: number;
  searches_today: number;
  active_sessions_24h: number;
  documents_added_this_week: number;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  email_confirmed_at: string | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  per_page: number;
}

/** Raw shape from backend (app_metadata dict instead of flat fields) */
interface RawAdminUser {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  created_at: string;
  resource_type: string | null;
  resource_id: string | null;
}

export interface SearchQueryEntry {
  id: string;
  user_id: string | null;
  query: string;
  result_count: number;
  duration_ms: number | null;
  created_at: string;
}

export interface SearchQueriesResponse {
  queries: SearchQueryEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface DocumentStats {
  total: number;
  by_type: Record<string, number>;
  by_country: Record<string, number>;
  by_language: Record<string, number>;
  added_this_week: number;
}

export interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  response_time_ms: number | null;
  message: string | null;
}

export interface SystemHealthResponse {
  status: string;
  services: Record<string, ServiceHealth>;
}

export interface ContentStats {
  total_posts: number;
  published: number;
  drafts: number;
  total_views: number;
}

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

async function adminFetch<T>(path: string): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Admin API error: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Overall platform statistics (users, documents, searches, active sessions).
 */
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminFetch<AdminStats>("/api/admin/stats"),
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Paginated list of platform users.
 * Transforms backend shape (app_metadata dict) into flat AdminUser fields.
 */
export function useAdminUsers(page: number = 1, perPage: number = 20) {
  return useQuery({
    queryKey: ["admin", "users", page, perPage],
    queryFn: async (): Promise<AdminUsersResponse> => {
      const raw = await adminFetch<{
        users: RawAdminUser[];
        page: number;
        per_page: number;
        total?: number;
      }>(`/api/admin/users?page=${page}&per_page=${perPage}`);

      const users: AdminUser[] = (raw.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at ?? "",
        last_sign_in_at: u.last_sign_in_at,
        is_admin: Boolean(u.app_metadata?.is_admin),
        email_confirmed_at: null, // Not returned by admin list_users
      }));

      return {
        users,
        total: raw.total ?? users.length,
        page: raw.page,
        per_page: raw.per_page,
      };
    },
    staleTime: 60_000,
  });
}

/**
 * Recent audit-log / activity entries.
 */
export function useAdminActivity(limit: number = 8) {
  return useQuery({
    queryKey: ["admin", "activity", limit],
    queryFn: () =>
      adminFetch<AuditLogEntry[]>(`/api/admin/activity?limit=${limit}`),
    staleTime: 30_000, // 30 seconds – activity changes quickly
  });
}

/**
 * Paginated search-query log.
 */
export function useAdminSearchQueries(page: number = 1, limit: number = 50) {
  return useQuery({
    queryKey: ["admin", "search-queries", page, limit],
    queryFn: () =>
      adminFetch<SearchQueriesResponse>(
        `/api/admin/search-queries?page=${page}&limit=${limit}`
      ),
    staleTime: 60_000,
  });
}

/**
 * Document corpus statistics (totals, breakdowns by type / country / language).
 */
export function useAdminDocumentStats() {
  return useQuery({
    queryKey: ["admin", "documents", "stats"],
    queryFn: () => adminFetch<DocumentStats>("/api/admin/documents/stats"),
    staleTime: 5 * 60_000, // 5 minutes – corpus changes slowly
  });
}

/**
 * Infrastructure health status for all backend services.
 */
export function useAdminSystemHealth() {
  return useQuery({
    queryKey: ["admin", "system", "health"],
    queryFn: () =>
      adminFetch<SystemHealthResponse>("/api/admin/system/health"),
    staleTime: 30_000, // 30 seconds – health needs to be fresh
  });
}

/**
 * Blog / content publishing statistics.
 */
export function useAdminContentStats() {
  return useQuery({
    queryKey: ["admin", "content", "stats"],
    queryFn: () => adminFetch<ContentStats>("/api/admin/content/stats"),
    staleTime: 5 * 60_000,
  });
}

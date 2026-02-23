"use client";

import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminSearchQueries } from "@/lib/api/admin";

const PAGE_SIZE = 50;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function AdminSearchQueriesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useAdminSearchQueries(
    page,
    PAGE_SIZE
  );

  const queries = data?.queries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background px-8 py-10">
      <div className="max-w-6xl mx-auto">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-foreground tracking-tight">
            Search Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent query activity and usage patterns.
          </p>
        </div>

        {/* Error */}
        {isError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            Failed to load search queries: {(error as Error).message}
          </div>
        )}

        {/* Summary stat */}
        {!isLoading && data && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3">
            <Search className="size-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Total logged queries:
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {total.toLocaleString()}
            </span>
          </div>
        )}

        {/* Queries table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-5 border-b border-border">
            <h2 className="font-serif text-xl text-foreground">
              Recent Queries
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Query
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Results
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr
                      key={i}
                      className="border-b border-border animate-pulse"
                    >
                      <td className="px-6 py-4">
                        <div className="h-4 w-56 rounded bg-muted" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-36 rounded bg-muted" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-8 rounded bg-muted" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-14 rounded bg-muted" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="h-4 w-20 rounded bg-muted ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : queries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-sm text-muted-foreground"
                    >
                      No search queries logged.
                    </td>
                  </tr>
                ) : (
                  queries.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-6 py-4 font-medium text-foreground max-w-xs">
                        <p className="truncate">{row.query}</p>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {row.user_id ? (
                          <span className="font-mono text-xs">{row.user_id.slice(0, 8)}…</span>
                        ) : (
                          <span className="italic text-muted-foreground/60">
                            anonymous
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground tabular-nums">
                        {row.result_count}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground tabular-nums">
                        {formatDuration(row.duration_ms)}
                      </td>
                      <td className="px-6 py-4 text-right text-muted-foreground/70 whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer pagination */}
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading…"
                : `Showing ${queries.length} of ${total.toLocaleString()} queries`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  Prev
                </button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={page === totalPages || isLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

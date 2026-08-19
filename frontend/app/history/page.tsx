"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  History,
  Search,
  Trash2,
  Clock,
  ArrowRight,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getUserSearchHistory,
  clearUserSearchHistory,
  UserSearchHistoryItem,
} from "@/lib/api/search-history";

export default function SearchHistoryPage(): React.JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<UserSearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserSearchHistory(30, 100);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load search history.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/auth/login?redirect=/history");
      } else {
        fetchHistory();
      }
    }
  }, [user, authLoading, router]);

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearUserSearchHistory();
      setHistory([]);
      setIsConfirmingClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear history.");
    } finally {
      setIsClearing(false);
    }
  };

  const filteredHistory = history.filter((item) =>
    item.query.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  if (authLoading || (!user && isLoading)) {
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <History className="h-6 w-6" />
            </div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
              Search History
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-11">
            Review and re-run your recent legal research queries across sessions.
          </p>
        </div>

        {history.length > 0 && (
          <div>
            {!isConfirmingClear ? (
              <button
                type="button"
                onClick={() => setIsConfirmingClear(true)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md border border-destructive/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Clear History
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Are you sure?</span>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={isClearing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {isClearing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                  className="px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls & Search */}
      {history.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter history queries..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Showing {filteredHistory.length} of {history.length} searches</span>
            <button
              type="button"
              onClick={fetchHistory}
              className="p-1.5 hover:text-foreground transition-colors"
              title="Refresh history"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-center gap-3 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* History List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/50">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground">
            {searchFilter ? "No matching queries" : "No search history yet"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-6">
            {searchFilter
              ? `No searches matching "${searchFilter}" were found in your recent history.`
              : "When you run searches, your queries and parameters will be saved here for easy access."}
          </p>
          {!searchFilter && (
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium text-sm transition-colors"
            >
              <Search className="h-4 w-4" />
              Start Searching
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item, idx) => (
            <div
              key={`${item.created_at}-${idx}`}
              className="group p-4 bg-card border border-border hover:border-primary/40 rounded-lg transition-all shadow-sm hover:shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/search?q=${encodeURIComponent(item.query)}`}
                    className="font-medium text-base text-foreground group-hover:text-primary transition-colors hover:underline truncate max-w-xl"
                  >
                    {item.query}
                  </Link>

                  {item.filters && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">
                      <Filter className="h-3 w-3" />
                      {item.filters}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(item.created_at)}
                  </span>

                  {item.hit_count !== null && item.hit_count !== undefined && (
                    <span>{item.hit_count} {item.hit_count === 1 ? "result" : "results"}</span>
                  )}

                  {item.processing_ms !== null && item.processing_ms !== undefined && (
                    <span>{item.processing_ms} ms</span>
                  )}
                </div>
              </div>

              <Link
                href={`/search?q=${encodeURIComponent(item.query)}`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-primary hover:text-primary-foreground rounded-md transition-colors self-start sm:self-center shrink-0"
              >
                <span>Re-run</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { PublicationCard } from "@/components/publications/publication-card";
import { publications as staticPublications, sortPublications, getPublicationYears } from "@/lib/data/publications";
import { PublicationType, PublicationWithResources } from "@/types/publication";
import { SecondaryButton, TextButton, DropdownButton } from "@/lib/styles/components";
import { BookOpen, Filter, Calendar, FileType, ArrowUpDown, Settings, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getPublications } from "@/lib/api/publications";

type FilterYear = number | "all";
type FilterType = PublicationType | "all";
type SortOption = "date" | "title";

export default function PublicationsPage() {
  const { user } = useAuth();
  const [publications, setPublications] = useState<PublicationWithResources[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<FilterYear>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortOption>("date");

  // Fetch publications from API on mount
  useEffect(() => {
    const fetchPublications = async () => {
      try {
        const data = await getPublications();
        setPublications(data);
      } catch (error) {
        console.error("Failed to fetch publications from API, using static data:", error);
        // Fallback to static publications if API fails
        setPublications(staticPublications as PublicationWithResources[]);
      } finally {
        setLoading(false);
      }
    };

    fetchPublications();
  }, []);

  const years = useMemo(() => {
    const pubYears = publications.map(p => p.year);
    return [...new Set(pubYears)].sort((a, b) => b - a);
  }, [publications]);

  const filteredPublications = useMemo(() => {
    let filtered = [...publications];

    // Filter by year
    if (filterYear !== "all") {
      filtered = filtered.filter(pub => pub.year === filterYear);
    }

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(pub => pub.type === filterType);
    }

    // Sort
    return sortPublications(filtered, sortBy);
  }, [publications, filterYear, filterType, sortBy]);

  const resetFilters = () => {
    setFilterYear("all");
    setFilterType("all");
    setSortBy("date");
  };

  const hasActiveFilters = filterYear !== "all" || filterType !== "all";

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1200px]">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1200px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800 dark:from-slate-100 dark:via-slate-200 dark:to-slate-100 bg-clip-text text-transparent">
            Publications
          </h1>
          {user && (
            <Link
              href="/publications/admin"
              className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage Publications
            </Link>
          )}
        </div>
        <p className="text-lg text-foreground/80 max-w-3xl leading-relaxed">
          Research publications from the Juddges project for court judgment analysis and extraction.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 p-6 border border-slate-200/50 dark:border-slate-800/50 rounded-lg bg-gradient-to-br from-blue-400/10 via-indigo-400/10 via-purple-400/10 to-purple-400/5 dark:from-blue-500/10 dark:via-indigo-500/10 dark:via-purple-500/10 dark:to-purple-500/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Filter & Sort</span>
          {hasActiveFilters && (
            <TextButton
              onClick={resetFilters}
              className="ml-auto text-xs"
            >
              Clear filters
            </TextButton>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Year Filter */}
          <div>
            <label className="text-sm font-semibold mb-2 block text-foreground">Year</label>
            <DropdownButton
              icon={<Calendar size={16} />}
              label="All years"
              value={String(filterYear)}
              options={[
                { value: "all", label: "All years" },
                ...years.map(year => ({ value: String(year), label: String(year) })),
              ]}
              onChange={(value) => setFilterYear(value === "all" ? "all" : parseInt(value))}
              className="w-full"
            />
          </div>

          {/* Type Filter */}
          <div>
            <label className="text-sm font-semibold mb-2 block text-foreground">Type</label>
            <DropdownButton
              icon={<FileType size={16} />}
              label="All types"
              value={filterType}
              options={[
                { value: "all", label: "All types" },
                { value: PublicationType.JOURNAL, label: "Journal" },
                { value: PublicationType.CONFERENCE, label: "Conference" },
                { value: PublicationType.WORKSHOP, label: "Workshop" },
                { value: PublicationType.PREPRINT, label: "Preprint" },
              ]}
              onChange={(value) => setFilterType(value as FilterType)}
              className="w-full"
            />
          </div>

          {/* Sort */}
          <div>
            <label className="text-sm font-semibold mb-2 block text-foreground">Sort by</label>
            <DropdownButton
              icon={<ArrowUpDown size={16} />}
              label="Sort by"
              value={sortBy}
              options={[
                { value: "date", label: "Date (newest first)" },
                { value: "title", label: "Title (A-Z)" },
              ]}
              onChange={(value) => setSortBy(value as SortOption)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-muted-foreground">
        Showing {filteredPublications.length} {filteredPublications.length === 1 ? 'publication' : 'publications'}
        {hasActiveFilters && ' (filtered)'}
      </div>

      {/* Publications list */}
      <div className="space-y-6">
        {filteredPublications.length > 0 ? (
          filteredPublications.map(publication => (
            <PublicationCard key={publication.id} publication={publication} currentUserId={user?.id} />
          ))
        ) : (
          <div className="text-center py-12 border border-slate-200/50 dark:border-slate-800/50 rounded-lg bg-gradient-to-br from-slate-50/30 via-white/20 to-slate-50/30 dark:from-slate-900/30 dark:via-slate-950/20 dark:to-slate-900/30">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2 text-foreground">No publications found</h3>
            <p className="text-foreground/80 mb-4">
              Try adjusting your filters to see more results.
            </p>
            <SecondaryButton onClick={resetFilters}>
              Clear all filters
            </SecondaryButton>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-12 pt-6 border-t border-slate-200/50 dark:border-slate-800/50 text-center text-sm text-foreground/70">
        <p>
          For citations, please refer to the publication venue or contact the authors directly.
        </p>
      </div>
    </div>
  );
}

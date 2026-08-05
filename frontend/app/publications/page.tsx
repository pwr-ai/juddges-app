"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { PublicationCard } from "@/components/publications/publication-card";
import {
 publications as referencePublications,
 sortPublications,
} from "@/lib/data/publications";
import { PublicationType, PublicationWithResources } from "@/types/publication";
import { DropdownButton } from "@/lib/styles/components";
import {
 BookOpen,
 Filter,
 Calendar,
 FileType,
 ArrowUpDown,
 Loader2,
 AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getPublications } from "@/lib/api/publications";
import { logger } from "@/lib/logger";
import {
 EditorialButton,
 Eyebrow,
 Headline,
 PaperBackground,
 Rule,
} from "@/components/editorial";

type FilterYear = number |"all";
type FilterType = PublicationType |"all";
type SortOption ="date"|"title";
type CatalogStatus = "loading" | "success" | "error";

function ReferenceBibliography() {
 const sortedReferences = sortPublications(referencePublications);

 return (
 <section className="mt-16" aria-labelledby="reference-bibliography-heading">
 <Eyebrow as="p" tone="gold" className="mb-3">Editorial reference collection</Eyebrow>
 <Headline
 id="reference-bibliography-heading"
 as="h2"
 size="sm"
 className="mb-4"
 >
 Curated reference bibliography
 </Headline>
 <p className="mb-8 max-w-3xl leading-relaxed text-[color:var(--ink-soft)]">
 This bibliography is maintained editorially and displayed separately from the live catalog above.
 Its entries are reference material, not API results or fallback data.
 </p>
 <div className="grid grid-cols-1 gap-px border border-[color:var(--rule)] bg-[color:var(--rule)] md:grid-cols-2">
 {sortedReferences.map((publication) => (
 <article
 key={publication.id}
 className="bg-[color:var(--parchment)] p-5 sm:p-6"
 >
 <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--oxblood)]">
 {publication.year} · {publication.type}
 </p>
 <h3 className="mb-3 font-serif text-2xl leading-tight text-[color:var(--ink)]">
 {publication.title}
 </h3>
 <p className="mb-2 text-sm text-[color:var(--ink-soft)]">
 {publication.authors.map((author) => author.name).join(", ")}
 </p>
 <p className="text-sm italic text-[color:var(--ink-soft)]">
 {publication.venue}
 </p>
 </article>
 ))}
 </div>
 </section>
 );
}

export default function PublicationsPage() {
 const { user } = useAuth();
 const isAdmin = user?.app_metadata?.is_admin === true;
 const [publications, setPublications] = useState<PublicationWithResources[]>([]);
 const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
 const [filterYear, setFilterYear] = useState<FilterYear>("all");
 const [filterType, setFilterType] = useState<FilterType>("all");
 const [sortBy, setSortBy] = useState<SortOption>("date");

 const fetchPublications = useCallback(async () => {
 setCatalogStatus("loading");
 try {
 const data = await getPublications();
 setPublications(data);
 setCatalogStatus("success");
 } catch (error) {
 logger.error("Failed to fetch publications from API: ", error);
 setPublications([]);
 setCatalogStatus("error");
 }
 }, []);

 useEffect(() => {
 fetchPublications();
 }, [fetchPublications]);

 const years = useMemo(() => {
 const pubYears = publications.map(p => p.year);
 return [...new Set(pubYears)].sort((a, b) => b - a);
 }, [publications]);

 const filteredPublications = useMemo(() => {
 let filtered = [...publications];

 // Filter by year
 if (filterYear !=="all") {
 filtered = filtered.filter(pub => pub.year === filterYear);
 }

 // Filter by type
 if (filterType !=="all") {
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

 const hasActiveFilters = filterYear !=="all"|| filterType !=="all";

 if (catalogStatus === "loading") {
 return (
 <PaperBackground className="min-h-[520px]">
 <div className="container mx-auto max-w-[1200px] px-6 py-8 md:px-8 lg:px-12">
 <div
 role="status"
 aria-live="polite"
 aria-label="Loading publications"
 className="flex items-center justify-center min-h-[400px]"
 >
 <Loader2
 className="h-8 w-8 animate-spin text-[color:var(--oxblood)]"
 aria-hidden="true"
 />
 </div>
 </div>
 </PaperBackground>
 );
 }

 return (
 <PaperBackground className="min-h-screen">
 <main className="container mx-auto max-w-[1200px] px-6 py-10 md:px-8 lg:px-12">
 {/* Header */}
 <header className="mb-10">
 <div className="mb-4 flex items-start justify-between gap-6">
 <div>
 <Eyebrow as="p" tone="oxblood" className="mb-3">Research archive</Eyebrow>
 <Headline as="h1" size="md">Publications</Headline>
 </div>
 {isAdmin && (
 <EditorialButton href="/publications/admin" variant="secondary" size="sm">
 Manage Publications
 </EditorialButton>
 )}
 </div>
 <p className="max-w-3xl text-lg leading-relaxed text-[color:var(--ink-soft)]">
 Research publications from the JuDDGES project for court judgment analysis and extraction.
 </p>
 </header>

 {catalogStatus === "error" ? (
 <section
 role="alert"
 className="border-y border-[color:var(--rule-strong)] bg-[color:var(--parchment-deep)] px-6 py-12 text-center"
 >
 <AlertTriangle className="mx-auto mb-4 h-9 w-9 text-[color:var(--oxblood)]" />
 <Headline as="h2" size="xs" className="mb-3">
 Publications are temporarily unavailable
 </Headline>
 <p className="mx-auto mb-6 max-w-xl text-[color:var(--ink-soft)]">
 We could not load the publications catalog. The catalog has not been replaced with sample records.
 </p>
 <EditorialButton onClick={fetchPublications}>Try again</EditorialButton>
 </section>
 ) : publications.length === 0 ? (
 <section className="border-y border-[color:var(--rule)] px-6 py-14 text-center">
 <BookOpen className="mx-auto mb-4 h-10 w-10 text-[color:var(--gold)]" />
 <Headline as="h2" size="xs" className="mb-3">No publications available</Headline>
 <p className="mx-auto max-w-xl text-[color:var(--ink-soft)]">
 The research catalog is currently empty. Published work will appear here when it is added.
 </p>
 </section>
 ) : (
 <>

 {/* Filters */}
 <section className="mb-8 border border-[color:var(--rule)] bg-[color:var(--parchment-deep)] p-6">
 <div className="flex items-center gap-2 mb-4">
 <Filter className="h-4 w-4 text-[color:var(--oxblood)]"/>
 <span className="font-semibold text-[color:var(--ink)]">Filter & Sort</span>
 {hasActiveFilters && (
 <EditorialButton variant="ghost" size="sm"
 onClick={resetFilters}
 className="ml-auto"
 >
 Clear filters
 </EditorialButton>
 )}
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {/* Year Filter */}
 <div>
 <label className="text-sm font-semibold mb-2 block text-foreground">Year</label>
 <DropdownButton
 ariaLabel={`Year filter: ${filterYear === "all" ? "All years" : filterYear}`}
 icon={<Calendar size={16} />}
 label="All years"
 value={String(filterYear)}
 options={[
 { value: "all", label: "All years"},
 ...years.map(year => ({ value: String(year), label: String(year) })),
 ]}
 onChange={(value) => setFilterYear(value === "all"? "all": parseInt(value))}
 className="w-full"
 />
 </div>

 {/* Type Filter */}
 <div>
 <label className="text-sm font-semibold mb-2 block text-foreground">Type</label>
 <DropdownButton
 ariaLabel={`Type filter: ${
 filterType === "all"
 ? "All types"
 : filterType.charAt(0).toUpperCase() + filterType.slice(1)
 }`}
 icon={<FileType size={16} />}
 label="All types"
 value={filterType}
 options={[
 { value: "all", label: "All types"},
 { value: PublicationType.JOURNAL, label: "Journal"},
 { value: PublicationType.CONFERENCE, label: "Conference"},
 { value: PublicationType.WORKSHOP, label: "Workshop"},
 { value: PublicationType.PREPRINT, label: "Preprint"},
 ]}
 onChange={(value) => setFilterType(value as FilterType)}
 className="w-full"
 />
 </div>

 {/* Sort */}
 <div>
 <label className="text-sm font-semibold mb-2 block text-foreground">Sort by</label>
 <DropdownButton
 ariaLabel={`Sort publications: ${
 sortBy === "date" ? "Date (newest first)" : "Title (A-Z)"
 }`}
 icon={<ArrowUpDown size={16} />}
 label="Sort by"
 value={sortBy}
 options={[
 { value: "date", label: "Date (newest first)"},
 { value: "title", label: "Title (A-Z)"},
 ]}
 onChange={(value) => setSortBy(value as SortOption)}
 className="w-full"
 />
 </div>
 </div>
 </section>

 {/* Results count */}
 <div className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
 Showing {filteredPublications.length} {filteredPublications.length === 1 ? 'publication' : 'publications'}
 {hasActiveFilters && ' (filtered)'}
 </div>

 <Rule className="mb-6" />

 {/* Publications list */}
 <div className="space-y-6">
 {filteredPublications.length > 0 ? (
 filteredPublications.map(publication => (
 <PublicationCard key={publication.id} publication={publication} currentUserId={user?.id} />
 ))
 ) : (
 <div className="border-y border-[color:var(--rule)] py-12 text-center">
 <BookOpen className="mx-auto mb-4 h-10 w-10 text-[color:var(--gold)]"/>
 <Headline as="h2" size="xs" className="mb-2">No publications match your filters</Headline>
 <p className="mb-4 text-[color:var(--ink-soft)]">
 Try adjusting your filters to see more results.
 </p>
 <EditorialButton variant="secondary" onClick={resetFilters}>
 Clear all filters
 </EditorialButton>
 </div>
 )}
 </div>
 </>
 )}

 <ReferenceBibliography />

 {/* Footer note */}
 <div className="mt-12 border-t border-[color:var(--rule)] pt-6 text-center text-sm text-[color:var(--ink-soft)]">
 <p>
 For citations, please refer to the publication venue or contact the authors directly.
 </p>
 </div>
 </main>
 </PaperBackground>
 );
}

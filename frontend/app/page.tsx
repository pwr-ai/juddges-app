"use client";

import Link from "next/link";
import {
  SkeletonTrendingTopic,
  SkeletonChatCard,
  SkeletonExtractionCard,
} from "@/components/ui/skeleton-card";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  useDashboardStats,
  useTrendingTopics,
  useUserSchemas,
  useCollectionsDocumentCount,
  useRecentExtractions,
} from "@/lib/api/dashboard";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileJson,
  Zap,
  Database,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageContainer,
  SchemaStatusBadge,
  VerifiedBadge,
} from "@/lib/styles/components";
import { formatStatNumber } from "@/lib/format-stats";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  EditorialCard,
  EditorialButton,
  Rule,
  Stat,
  Citation,
} from "@/components/editorial";
import React from "react";

const BIBTEX = `@misc{juddges2024,
  title  = {JuDDGES: Judicial Decision Data Gathering, Encoding and Sharing},
  author = {Kajdanowicz, Tomasz and others},
  year   = {2024},
  url    = {https://huggingface.co/JuDDGES},
  note   = {Wrocław University of Science and Technology}
}`;

function formatLastUpdated(dateString: string | null): { value: string; label: string } {
  if (!dateString) {
    // Temporary fix: return current date if no data
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return { value: `${day}/${month}/${year}`, label: "Last Updated" };
  }

  const date = new Date(dateString);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    // Temporary fix: return current date if invalid
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return { value: `${day}/${month}/${year}`, label: "Last Updated" };
  }

  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 1) return { value: "Just now", label: "" };
  if (diffInHours < 24) return { value: `${diffInHours}hrs`, label: "ago" };
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return { value: "Yesterday", label: "" };
  if (diffInDays < 7) return { value: `${diffInDays} days`, label: "ago" };

  // Format date as DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return { value: `${day}/${month}/${year}`, label: "" };
}

function formatChatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  // Format date as DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// ---------- Editorial-styled empty state -----------------------------------

interface EditorialEmptyStateProps {
  message: string;
  actionHref: string;
  actionLabel: string;
}

function EditorialEmptyState({
  message,
  actionHref,
  actionLabel,
}: EditorialEmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 border border-rule px-4 py-8 text-center">
      <p className="font-serif text-base italic leading-snug text-ink-soft">
        {message}
      </p>
      <EditorialButton variant="secondary" size="sm" href={actionHref}>
        {actionLabel}
      </EditorialButton>
    </div>
  );
}

// ---------- "View all" header action ----------------------------------------

function ViewAllAction({ href, label }: { href: string; label: string }): React.JSX.Element {
  return (
    <EditorialButton variant="ghost" size="sm" href={href} arrow>
      {label}
    </EditorialButton>
  );
}

function CopyButton(): React.JSX.Element {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = React.useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(BIBTEX);
      setState("copied");
    } catch {
      setState("failed");
    }
    timerRef.current = setTimeout(() => setState("idle"), 2000);
  }, []);

  const label =
    state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy";
  const ariaLabel =
    state === "copied"
      ? "BibTeX copied to clipboard"
      : state === "failed"
        ? "Copy to clipboard failed — select the BibTeX text and copy manually"
        : "Copy BibTeX to clipboard";
  const icon =
    state === "copied" ? <Check className="size-3" /> : <Copy className="size-3" />;
  const stateClass = state === "failed" ? "text-oxblood" : "text-ink-soft";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "absolute top-2 right-2 inline-flex items-center gap-1.5 border border-rule bg-parchment px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        stateClass,
      )}
      aria-label={ariaLabel}
    >
      {icon}
      {label}
    </button>
  );
}

export default function HomePage(): React.JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();

  // Use React Query hooks for data fetching with automatic caching
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorDetails,
  } = useDashboardStats();

  const { data: trendingTopics = [], isLoading: trendsLoading } = useTrendingTopics(3);


  const { data: userSchemas = [], isLoading: schemasLoading } = useUserSchemas(3);

  const { data: collectionsInfo, isLoading: collectionsLoading } =
    useCollectionsDocumentCount();

  const collectionsDocCount = collectionsInfo?.documentCount || 0;
  const collectionsCount = collectionsInfo?.collectionCount || 0;

  const { data: recentExtractions = [], isLoading: extractionsLoading } =
    useRecentExtractions(3);

  // Individual loading states - each card loads separately

  // For unauthenticated users, show the premium landing page
  if (!authLoading && !user) {
    // Map DashboardStats to LandingStats interface
    const landingStats = stats
      ? {
          total_documents: stats.total_judgments,
          judgments: stats.total_judgments,
          judgments_pl: stats.jurisdictions?.PL ?? 0,
          judgments_uk: stats.jurisdictions?.UK ?? 0,
          last_updated: stats.computed_at,
        }
      : null;

    return <LandingPage stats={landingStats} statsLoading={statsLoading} />;
  }

  // -- Derived figures for the featured stats card ---------------------------
  const totalJudgments = stats?.total_judgments ?? 0;
  const plCount = stats?.jurisdictions?.PL ?? 0;
  const ukCount = stats?.jurisdictions?.UK ?? 0;
  const jurisdictionCount = [plCount, ukCount].filter((n) => n > 0).length;
  const lastUpdated = stats ? formatLastUpdated(stats.computed_at) : null;

  // Conditional trending display logic
  const showTrending = trendsLoading || trendingTopics.length > 0;

  // For authenticated users, show the redesigned editorial dashboard
  return (
    <PageContainer width="standard" className="py-6">
      {/* 12-col asymmetric grid; mobile collapses to a single column. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ============ ROW 1 ============ */}

        {/* Featured: Database overview (8 or 12 cols depending on trending visibility) */}
        <div className={showTrending ? "lg:col-span-8" : "lg:col-span-12"}>
          <EditorialCard
            featured
            eyebrow={t("dashboard.databaseOverview")}
            title={t("dashboard.databaseOverview")}
            action={<ViewAllAction href="/statistics" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {statsLoading ? (
              <div className="flex flex-1 flex-col gap-4">
                <div className="grid grid-cols-3 gap-6">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-10 w-24 animate-pulse bg-rule/60" />
                      <div className="h-3 w-16 animate-pulse bg-rule/40" />
                    </div>
                  ))}
                </div>
                <Rule weight="ink" />
                <div className="h-4 w-48 animate-pulse bg-rule/40" />
              </div>
            ) : statsError ? (
              <div className="border border-oxblood/40 bg-oxblood/5 p-4 text-oxblood">
                <p className="text-sm font-medium">{t("dashboard.failedToLoadStats")}</p>
                <p className="mt-1 text-xs text-oxblood/80">
                  {statsErrorDetails instanceof Error
                    ? statsErrorDetails.message
                    : "Unknown error"}
                </p>
              </div>
            ) : stats ? (
              <div className="flex flex-1 flex-col gap-5">
                {/* Three headline figures */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <Stat
                    size="sm"
                    value={totalJudgments}
                    label={t("dashboard.recentJudgments") || "Judgments"}
                    marker="¹"
                  />
                  <Stat
                    size="sm"
                    static
                    value={jurisdictionCount}
                    label="Jurisdictions"
                  />
                  <Stat size="sm" value={plCount + ukCount} label="Indexed" />
                </div>

                <Rule weight="ink" />

                {/* Jurisdiction breakdown + last-updated meta line */}
                <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    PL <span className="text-ink">{formatStatNumber(plCount)}</span>
                    <span className="mx-2 text-rule-strong">/</span>
                    UK <span className="text-ink">{formatStatNumber(ukCount)}</span>
                  </span>
                  {lastUpdated && (
                    <span>
                      {lastUpdated.label || "Updated"}{" "}
                      <span className="text-ink">{lastUpdated.value}</span>
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </EditorialCard>
        </div>

        {/* Popular legal topics (4 cols) - only show when loading or has content */}
        {showTrending && (
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Trending"
            title={t("dashboard.popularLegalTopics")}
            className="h-full"
          >
            {trendsLoading ? (
              <ul className="divide-y divide-rule">
                {[0, 1].map((i) => (
                  <li key={i} className="py-3">
                    <SkeletonTrendingTopic />
                  </li>
                ))}
              </ul>
            ) : trendingTopics.length > 0 ? (
              <ul className="divide-y divide-rule">
                {trendingTopics.map((topic, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {topic.topic}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                        {topic.category}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {topic.trend === "up" && (
                        <TrendingUp className="size-3.5 text-oxblood" />
                      )}
                      {topic.trend === "down" && (
                        <TrendingDown className="size-3.5 text-ink-soft" />
                      )}
                      {topic.trend === "stable" && (
                        <Minus className="size-3.5 text-ink-soft" />
                      )}
                      <span
                        className={cn(
                          "font-mono text-[11px] font-medium tabular-nums",
                          topic.trend === "up"
                            ? "text-oxblood"
                            : "text-ink-soft",
                        )}
                      >
                        {topic.change}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-serif text-sm italic text-ink-soft">
                {t("dashboard.noTrending")}
              </p>
            )}
          </EditorialCard>
        </div>
        )}

        {/* ============ ROW 2 (3 cards × 4 cols) ============ */}

        {/* About JUDDGES */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="About"
            title="JUDDGES"
            className="h-full"
          >
            <div className="flex flex-1 flex-col gap-3">
              <p className="font-serif italic text-ink-soft text-sm leading-snug">
                Judicial Decision Data Gathering, Encoding &amp; Sharing
              </p>
              <p className="text-sm text-ink leading-relaxed">
                An end-to-end platform for hybrid search, retrieval-augmented chat, structured information extraction, and analytics over Polish and England &amp; Wales court judgments — built for legal experts, NLP researchers, and dataset annotators.
              </p>
              <Rule weight="hairline" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                <span className="text-ink">PI</span>
                <span className="mx-1.5 text-rule-strong">·</span>
                Tomasz Kajdanowicz
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-1">
                <span className="text-ink">15.01.2024 – 30.06.2026</span>
                <span className="mx-1.5 text-rule-strong">·</span>
                529,384 EUR
              </p>
              <div className="flex flex-col gap-2 mt-auto">
                <EditorialButton variant="primary" size="sm" href="https://huggingface.co/JuDDGES" external arrow>
                  Hugging Face datasets
                </EditorialButton>
                <EditorialButton variant="ghost" size="sm" href="/about" arrow>
                  About the project
                </EditorialButton>
              </div>
            </div>
          </EditorialCard>
        </div>

        {/* Coding schemas */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Coding Schemas"
            title={t("dashboard.extractionTemplates")}
            action={
              userSchemas.length > 0 ? (
                <ViewAllAction href="/schema-chat" label={t("dashboard.viewAll")} />
              ) : undefined
            }
            className="h-full"
          >
            {schemasLoading ? (
              <ul className="divide-y divide-rule">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="py-3">
                    <SkeletonChatCard />
                  </li>
                ))}
              </ul>
            ) : userSchemas.length > 0 ? (
              <ul className="divide-y divide-rule">
                {userSchemas.map((schema) => (
                  <li key={schema.id} className="first:pt-0 last:pb-0">
                    <Link
                      href={`/schema-chat?schemaId=${schema.id}`}
                      className="group block py-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start gap-3">
                        <FileJson className="mt-0.5 size-4 shrink-0 text-ink-soft group-hover:text-oxblood" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-oxblood">
                              {schema.name}
                            </p>
                            {schema.status && (
                              <SchemaStatusBadge status={schema.status} size="sm" />
                            )}
                            {schema.is_verified && <VerifiedBadge size="sm" />}
                          </div>
                          {schema.description && (
                            <p className="mt-1 line-clamp-1 text-xs text-ink-soft">
                              {schema.description}
                            </p>
                          )}
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                            <span className="capitalize">{schema.category}</span>
                            <span className="mx-1.5 text-rule-strong">·</span>
                            {formatChatTimestamp(schema.updated_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EditorialEmptyState
                message={t("dashboard.noSchemas")}
                actionHref="/schema-chat"
                actionLabel={t("dashboard.generateTemplate")}
              />
            )}
          </EditorialCard>
        </div>

        {/* Recent extractions */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Extractions"
            title={t("dashboard.recentExtractions")}
            action={<ViewAllAction href="/extract" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {extractionsLoading ? (
              <ul className="divide-y divide-rule">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="py-3">
                    <SkeletonExtractionCard />
                  </li>
                ))}
              </ul>
            ) : recentExtractions.length > 0 ? (
              <ul className="divide-y divide-rule">
                {recentExtractions.map((job) => {
                  // Map backend status -> editorial citation marker for visual rhythm.
                  const statusMarker =
                    job.status === "SUCCESS"
                      ? "*"
                      : job.status === "FAILURE"
                        ? "†"
                        : "·";
                  return (
                    <li key={job.job_id} className="first:pt-0 last:pb-0">
                      <Link
                        href={`/extract?jobId=${job.job_id}`}
                        className="group block py-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-start gap-3">
                          <Zap className="mt-0.5 size-4 shrink-0 text-ink-soft group-hover:text-oxblood" />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-oxblood">
                              {job.collection_name || "Extraction Job"}
                              <Citation marker={statusMarker} />
                            </p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                              {job.status}
                              <span className="mx-1.5 text-rule-strong">·</span>
                              {formatChatTimestamp(job.created_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EditorialEmptyState
                message={t("dashboard.noExtractions")}
                actionHref="/extract"
                actionLabel={t("dashboard.startExtraction")}
              />
            )}
          </EditorialCard>
        </div>

        {/* ============ ROW 3 ============ */}

        {/* Quick-start strip (8 cols) */}
        <div className="lg:col-span-8">
          <EditorialCard
            eyebrow="Get started"
            title="Three steps to legal-AI research"
            className="h-full"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <Link
                href="/search"
                className="group flex items-start gap-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span aria-hidden className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft group-hover:text-oxblood">01</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink group-hover:text-oxblood">Search judgments</p>
                  <p className="mt-1 text-xs text-ink-soft">Find PL & UK case law with hybrid semantic + full-text search.</p>
                </div>
                <span aria-hidden className="text-ink-soft transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-oxblood">→</span>
              </Link>
              <Link
                href="/collections"
                className="group flex items-start gap-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span aria-hidden className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft group-hover:text-oxblood">02</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink group-hover:text-oxblood">Save to a collection</p>
                  <p className="mt-1 text-xs text-ink-soft">Group judgments into reusable research sets.</p>
                </div>
                <span aria-hidden className="text-ink-soft transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-oxblood">→</span>
              </Link>
              <Link
                href="/schema-chat"
                className="group flex items-start gap-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span aria-hidden className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft group-hover:text-oxblood">03</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink group-hover:text-oxblood">Extract structured data</p>
                  <p className="mt-1 text-xs text-ink-soft">Build a coding schema and run extraction on a slice.</p>
                </div>
                <span aria-hidden className="text-ink-soft transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-oxblood">→</span>
              </Link>
            </div>
          </EditorialCard>
        </div>

        {/* Research collections (4 cols) */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Library"
            title={t("dashboard.researchCollections")}
            action={<ViewAllAction href="/collections" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {collectionsLoading ? (
              <div className="flex flex-1 items-center gap-6">
                <div className="h-10 w-20 animate-pulse bg-rule/60" />
                <div className="h-10 w-20 animate-pulse bg-rule/60" />
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-4">
                <div className="grid grid-cols-2 gap-6">
                  <Stat
                    size="sm"
                    static
                    value={collectionsCount}
                    label="Collections"
                  />
                  <Stat
                    size="sm"
                    static
                    value={collectionsDocCount}
                    label="Documents"
                  />
                </div>
                <Rule weight="hairline" />
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  <Database className="size-3.5 text-ink-soft" />
                  Curated research sets
                </p>
              </div>
            )}
          </EditorialCard>
        </div>

        {/* ============ ROW 4 ============ */}

        {/* Cite JUDDGES (8 cols) */}
        <div className="lg:col-span-8">
          <EditorialCard
            eyebrow="Cite"
            title="How to cite JUDDGES"
            className="h-full"
          >
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-ink leading-relaxed">
                If JUDDGES contributed to your research, please cite the project using the BibTeX entry below.
              </p>
              <div className="relative border border-rule bg-parchment-deep/40 p-4">
                <pre className="font-mono text-[11px] leading-relaxed text-ink overflow-x-auto whitespace-pre">{BIBTEX}</pre>
                <CopyButton />
              </div>
            </div>
          </EditorialCard>
        </div>

        {/* What's new (4 cols) */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Releases"
            title="What's new"
            className="h-full"
          >
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm text-ink leading-relaxed">
                Editorial Jurisprudence design system, decision-type analytics, and improved search ranking.
              </p>
              <div className="mt-auto">
                <EditorialButton variant="ghost" size="sm" href="/changelog" arrow>
                  Read the changelog
                </EditorialButton>
              </div>
            </div>
          </EditorialCard>
        </div>
      </div>

    </PageContainer>
  );
}

"use client";

import Link from "next/link";
import {
  SkeletonTrendingTopic,
  SkeletonChatCard,
  SkeletonDocumentCard,
  SkeletonExtractionCard,
} from "@/components/ui/skeleton-card";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  useDashboardStats,
  useRecentDocuments,
  useTrendingTopics,
  useRecentChats,
  useUserSchemas,
  useCollectionsDocumentCount,
  useRecentExtractions,
} from "@/lib/api/dashboard";
import {
  MessageSquare,
  FileText,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  FileJson,
  Zap,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageContainer,
  SchemaStatusBadge,
  VerifiedBadge,
} from "@/lib/styles/components";
import { formatStatNumber } from "@/lib/format-stats";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  EditorialCard,
  EditorialButton,
  Rule,
  Stat,
  Citation,
} from "@/components/editorial";
import React from "react";

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

  const { data: recentDocs = [], isLoading: docsLoading } = useRecentDocuments(2);

  const { data: trendingTopics = [], isLoading: trendsLoading } = useTrendingTopics(3);

  const { data: recentChats = [], isLoading: chatsLoading } = useRecentChats(3);

  const { data: userSchemas = [], isLoading: schemasLoading } = useUserSchemas(3);

  const { data: collectionsInfo, isLoading: collectionsLoading } =
    useCollectionsDocumentCount();

  const collectionsDocCount = collectionsInfo?.documentCount || 0;
  const collectionsCount = collectionsInfo?.collectionCount || 0;

  const { data: recentExtractions = [], isLoading: extractionsLoading } =
    useRecentExtractions(3);
  const recentJudgmentDocs = recentDocs
    .filter((doc) => doc.document_type === "judgment")
    .slice(0, 2);

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

  // For authenticated users, show the redesigned editorial dashboard
  return (
    <PageContainer width="standard" className="py-6">
      {/* 12-col asymmetric grid; mobile collapses to a single column. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ============ ROW 1 ============ */}

        {/* Featured: Database overview (8 cols) */}
        <div className="lg:col-span-8">
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

        {/* Popular legal topics (4 cols) */}
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

        {/* ============ ROW 2 (3 cards × 4 cols) ============ */}

        {/* Recent conversations */}
        <div className="lg:col-span-4">
          <EditorialCard
            eyebrow="Conversations"
            title={t("dashboard.recentConversations")}
            action={<ViewAllAction href="/chat" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {chatsLoading ? (
              <ul className="divide-y divide-rule">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="py-3">
                    <SkeletonChatCard />
                  </li>
                ))}
              </ul>
            ) : recentChats.length > 0 ? (
              <ul className="divide-y divide-rule">
                {recentChats.slice(0, 3).map((chat) => {
                  const chatTitle = chat.title || chat.firstMessage || "New Chat";
                  const truncatedTitle =
                    chatTitle.length > 60
                      ? chatTitle.substring(0, 57) + "..."
                      : chatTitle;
                  return (
                    <li key={chat.id} className="first:pt-0 last:pb-0">
                      <Link
                        href={`/chat/${chat.id}`}
                        className="group block py-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-start gap-3">
                          <MessageSquare className="mt-0.5 size-4 shrink-0 text-ink-soft group-hover:text-oxblood" />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-oxblood">
                              {truncatedTitle}
                            </p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                              {formatChatTimestamp(chat.updated_at)}
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
                message={t("dashboard.noChats")}
                actionHref="/chat"
                actionLabel={t("dashboard.startChat")}
              />
            )}
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

        {/* Recent judgments (8 cols) */}
        <div className="lg:col-span-8">
          <EditorialCard
            eyebrow="Case law"
            title={t("dashboard.recentJudgments")}
            action={<ViewAllAction href="/search" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {docsLoading ? (
              <ul className="divide-y divide-rule">
                {[0, 1].map((i) => (
                  <li key={i} className="py-3">
                    <SkeletonDocumentCard />
                  </li>
                ))}
              </ul>
            ) : recentJudgmentDocs.length > 0 ? (
              <ul className="divide-y divide-rule">
                {recentJudgmentDocs.map((doc) => {
                  const docTypeLabel =
                    doc.document_type === "judgment"
                      ? "JUDGMENT"
                      : doc.document_type?.toUpperCase() || "DOCUMENT";
                  const displayTitle =
                    doc.title || doc.document_number || doc.document_id || "Untitled Document";
                  const displayDate = doc.publication_date
                    ? new Date(doc.publication_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : null;

                  const documentId = cleanDocumentIdForUrl(doc.document_id || doc.id);
                  const Icon = doc.document_type === "judgment" ? Scale : FileText;
                  return (
                    <li key={doc.id} className="first:pt-0 last:pb-0">
                      <Link
                        href={`/documents/${documentId}`}
                        className="group block py-3 transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="mt-0.5 size-4 shrink-0 text-ink-soft group-hover:text-oxblood" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                                {docTypeLabel}
                              </span>
                              {displayDate && (
                                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                                  {displayDate}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm font-medium text-ink group-hover:text-oxblood">
                              {displayTitle}
                            </p>
                            {doc.document_number && (
                              <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                                {doc.document_number}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EditorialEmptyState
                message={t("dashboard.noDocuments")}
                actionHref="/search"
                actionLabel={t("dashboard.browseJudgments")}
              />
            )}
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
      </div>

    </PageContainer>
  );
}

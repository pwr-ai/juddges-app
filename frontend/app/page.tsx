"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  useDashboardResearchActivity,
  useDashboardStats,
} from "@/lib/api/dashboard";
import { formatLastUpdated } from "@/lib/date-utils";
import { Check, Copy, Database, FileJson, FolderOpen, Search } from "lucide-react";
import { PageContainer } from "@/lib/styles/components";
import { formatStatNumber } from "@/lib/format-stats";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  EditorialCard,
  EditorialButton,
  Rule,
  Stat,
} from "@/components/editorial";
import React from "react";

const BIBTEX = `@software{juddges_app_2026,
  title   = {Juddges App},
  author  = {Augustyniak, Łukasz and Binkowski, Jakub and Sawczyn, Albert and Tagowski, Kamil and Bernaczyk, Michał and Kamiński, Krzysztof and Kajdanowicz, Tomasz},
  year    = {2026},
  version = {0.1.0},
  doi     = {10.5281/zenodo.19911856},
  url     = {https://github.com/pwr-ai/juddges-app},
  license = {Apache-2.0}
}`;

// ---------- "View all" header action ----------------------------------------

function ViewAllAction({ href, label }: { href: string; label: string }): React.JSX.Element {
  return (
    <EditorialButton variant="ghost" size="sm" href={href} arrow>
      {label}
    </EditorialButton>
  );
}

function OnboardingBanner(): React.JSX.Element | null {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem("onboarding-dismissed");
      if (dismissed !== "true") setVisible(true);
    } catch {
      // Ignore — storage may be unavailable.
    }
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem("onboarding-dismissed", "true");
    } catch {
      // Ignore.
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-4 border border-rule bg-parchment-deep/40 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          New here?
        </span>
        <span className="truncate text-sm text-ink">
          Take the 30-minute tour for legal researchers.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/onboarding"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-oxblood transition-colors hover:text-oxblood-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Start tour →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss onboarding banner"
          className="text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function CitationCopyAction(): React.JSX.Element {
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
    state === "copied"
      ? "Citation copied"
      : state === "failed"
        ? "Copy failed"
        : "Copy JUDDGES citation";

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="group flex w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="flex items-center gap-3 text-sm font-medium text-ink group-hover:text-oxblood">
        {state === "copied" ? (
          <Check className="size-4 text-ink-soft" aria-hidden />
        ) : (
          <Copy className="size-4 text-ink-soft" aria-hidden />
        )}
        {label}
      </span>
    </button>
  );
}

export default function HomePage(): React.JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useTranslation();

  // Use React Query hooks for data fetching with automatic caching
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorDetails,
  } = useDashboardStats();


  const {
    data: researchActivity,
    isLoading: activityLoading,
    isError: activityError,
  } = useDashboardResearchActivity(authLoading ? undefined : user?.id);

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

    return (
      <LandingPage
        stats={landingStats}
        statsLoading={statsLoading}
        statsError={statsError}
      />
    );
  }

  // -- Derived figures for the featured stats card ---------------------------
  const totalJudgments = stats?.total_judgments ?? 0;
  const plCount = stats?.jurisdictions?.PL ?? 0;
  const ukCount = stats?.jurisdictions?.UK ?? 0;
  const jurisdictionCount = [plCount, ukCount].filter((n) => n > 0).length;
  const lastUpdated = stats ? formatLastUpdated(stats.computed_at) : null;
  const dateLocale = locale === "pl" ? "pl-PL" : "en-GB";
  const formatActivityDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(dateLocale, {
      day: "numeric",
      month: "short",
    }).format(date);
  };

  return (
    <PageContainer width="standard" className="py-6">
      <OnboardingBanner />

      <section className="mb-6 border-y border-ink bg-parchment-deep/30 px-5 py-6 sm:flex sm:items-end sm:justify-between sm:gap-8 sm:px-6">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-oxblood">
            Research workspace
          </p>
          <h2 className="mt-2 font-serif text-3xl leading-tight text-ink sm:text-4xl">
            Move from a legal question to structured, reviewable evidence.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
            Search Polish and UK judgments, organise the relevant decisions, then
            extract comparable facts with a shared coding schema.
          </p>
        </div>
        <div className="mt-5 flex shrink-0 flex-col gap-2 sm:mt-0 sm:min-w-48">
          <EditorialButton href="/search" size="md" arrow>
            Search judgments
          </EditorialButton>
          <EditorialButton href="/collections" variant="secondary" size="md">
            Open collections
          </EditorialButton>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <EditorialCard
            featured
            eyebrow="Research workflow"
            title="Plan, search, then analyze"
            className="h-full"
          >
            <ol className="grid grid-cols-1 border-y border-rule sm:grid-cols-3">
              <li className="p-4 sm:pr-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-oxblood">
                  01 · Plan
                </p>
                <h4 className="mt-2 text-base font-medium text-ink">Build an evidence set</h4>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Create a research collection for the question, jurisdiction, and
                  judgments you need to compare.
                </p>
                <Link
                  href="/collections"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <FolderOpen className="size-4" aria-hidden />
                  Open collections →
                </Link>
              </li>
              <li className="border-y border-rule bg-parchment-deep/35 p-4 sm:border-x sm:border-y-0 sm:px-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-oxblood">
                  02 · Search
                </p>
                <h4 className="mt-2 text-base font-medium text-ink">Find and review judgments</h4>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Combine semantic and full-text search, refine the result set, and
                  save authoritative decisions.
                </p>
                <Link
                  href="/search"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-oxblood transition-colors hover:text-oxblood-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Search className="size-4" aria-hidden />
                  Search judgments →
                </Link>
              </li>
              <li className="p-4 sm:pl-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-oxblood">
                  03 · Analyze
                </p>
                <h4 className="mt-2 text-base font-medium text-ink">Extract comparable facts</h4>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Choose a coding schema, run extraction on the collection, and
                  inspect the structured results.
                </p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
                  <Link
                    href="/schemas"
                    className="text-ink transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Choose schema →
                  </Link>
                  <Link
                    href="/extract"
                    className="text-ink transition-colors hover:text-oxblood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Run extraction →
                  </Link>
                </div>
              </li>
            </ol>
          </EditorialCard>
        </div>

        <div className="lg:col-span-12">
          <EditorialCard
            eyebrow="Your work"
            title="Continue your research"
            className="h-full"
          >
            {activityLoading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {[0, 1].map((column) => (
                  <div key={column} className="space-y-3" aria-hidden>
                    <div className="h-3 w-28 animate-pulse bg-rule/60" />
                    <div className="h-12 animate-pulse bg-rule/35" />
                    <div className="h-12 animate-pulse bg-rule/35" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 md:gap-0">
                <section className="md:pr-6" aria-labelledby="recent-searches-heading">
                  <div className="flex items-center justify-between gap-4">
                    <h4
                      id="recent-searches-heading"
                      className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft"
                    >
                      Recent searches
                    </h4>
                    <ViewAllAction href="/history" label="View history" />
                  </div>
                  {activityError || researchActivity?.searchesUnavailable ? (
                    <p className="mt-4 text-sm text-ink-soft">
                      Search history is temporarily unavailable. You can still start a new search.
                    </p>
                  ) : researchActivity?.recentSearches.length ? (
                    <ul className="mt-2 divide-y divide-rule">
                      {researchActivity.recentSearches.map((search, index) => (
                        <li key={`${search.created_at}-${index}`}>
                          <Link
                            href={`/search?q=${encodeURIComponent(search.query)}`}
                            className="group flex items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink group-hover:text-oxblood">
                                {search.query}
                              </span>
                              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                                {search.hit_count == null
                                  ? "Previous query"
                                  : `${formatStatNumber(search.hit_count)} results`}
                                <span className="mx-2 text-rule-strong">·</span>
                                {formatActivityDate(search.created_at)}
                              </span>
                            </span>
                            <span aria-hidden className="text-ink-soft group-hover:text-oxblood">→</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 border-l-2 border-gold pl-4">
                      <p className="text-sm text-ink">No searches yet.</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        Start with a legal question; your recent queries will appear here.
                      </p>
                    </div>
                  )}
                </section>

                <section
                  className="border-t border-rule pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0"
                  aria-labelledby="recent-collections-heading"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4
                        id="recent-collections-heading"
                        className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft"
                      >
                        Latest collections
                      </h4>
                      {researchActivity && !researchActivity.collectionsUnavailable && (
                        <p className="mt-1 text-xs text-ink-soft">
                          {formatStatNumber(researchActivity.collectionCount)} collections
                          <span className="mx-2 text-rule-strong">·</span>
                          {formatStatNumber(researchActivity.documentCount)} judgments
                        </p>
                      )}
                    </div>
                    <ViewAllAction href="/collections" label="View all" />
                  </div>
                  {activityError || researchActivity?.collectionsUnavailable ? (
                    <p className="mt-4 text-sm text-ink-soft">
                      Collections are temporarily unavailable. Try opening the library directly.
                    </p>
                  ) : researchActivity?.recentCollections.length ? (
                    <ul className="mt-2 divide-y divide-rule">
                      {researchActivity.recentCollections.map((collection) => (
                        <li key={collection.id}>
                          <Link
                            href={`/collections/${collection.id}`}
                            className="group flex items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink group-hover:text-oxblood">
                                {collection.name}
                              </span>
                              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                                {formatStatNumber(collection.documentCount)} judgments
                                <span className="mx-2 text-rule-strong">·</span>
                                Updated {formatActivityDate(collection.updatedAt)}
                              </span>
                            </span>
                            <span aria-hidden className="text-ink-soft group-hover:text-oxblood">→</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 border-l-2 border-gold pl-4">
                      <p className="text-sm text-ink">No collections yet.</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        Create one to keep relevant judgments together for analysis.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </EditorialCard>
        </div>

        <div className="lg:col-span-7">
          <EditorialCard
            eyebrow={t("dashboard.databaseOverview")}
            title="Corpus coverage"
            action={<ViewAllAction href="/statistics" label={t("dashboard.viewAll")} />}
            className="h-full"
          >
            {statsLoading ? (
              <div className="flex flex-1 flex-col gap-4">
                <div className="grid grid-cols-3 gap-6">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-10 w-20 animate-pulse bg-rule/60" />
                      <div className="h-3 w-16 animate-pulse bg-rule/40" />
                    </div>
                  ))}
                </div>
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <Stat size="sm" value={totalJudgments} label={t("dashboard.judgments")} />
                  <Stat size="sm" value={plCount} label="Poland" />
                  <Stat size="sm" value={ukCount} label="United Kingdom" />
                </div>
                <Rule weight="hairline" />
                <div className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
                  <span>{jurisdictionCount} jurisdictions indexed</span>
                  {lastUpdated && (
                    <span>
                      Last updated <span className="text-ink">{lastUpdated.value}</span>{" "}
                      {lastUpdated.label}
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </EditorialCard>
        </div>

        <div className="lg:col-span-5">
          <EditorialCard
            eyebrow="Resources"
            title="Reference material"
            className="h-full"
          >
            <nav className="divide-y divide-rule" aria-label="Research resources">
              <Link
                href="/schemas/base"
                className="group flex items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-ink group-hover:text-oxblood">
                  <FileJson className="size-4 text-ink-soft" aria-hidden />
                  Base coding schema
                </span>
                <span aria-hidden className="text-ink-soft group-hover:text-oxblood">→</span>
              </Link>
              <Link
                href="/search/extractions"
                className="group flex items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-ink group-hover:text-oxblood">
                  <Database className="size-4 text-ink-soft" aria-hidden />
                  Search extracted data
                </span>
                <span aria-hidden className="text-ink-soft group-hover:text-oxblood">→</span>
              </Link>
              <Link
                href="/ecosystem"
                className="group flex items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="text-sm font-medium text-ink group-hover:text-oxblood">
                  Datasets and project ecosystem
                </span>
                <span aria-hidden className="text-ink-soft group-hover:text-oxblood">→</span>
              </Link>
              <CitationCopyAction />
            </nav>
          </EditorialCard>
        </div>
      </div>
    </PageContainer>
  );
}

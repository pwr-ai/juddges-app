"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartFigure,
  EditorialButton,
  EditorialCard,
  Eyebrow,
  Headline,
  Rule,
  Stat,
} from "@/components/editorial";
import { useDashboardStats } from "@/lib/api/dashboard";
import { formatStatNumber } from "@/lib/format-stats";
import { PageContainer } from "@/lib/styles/components";
import {
  selectUKDashboardStats,
  type JurisdictionDistributionItem,
  type JurisdictionYearlyItem,
} from "./uk-stats";

const COLOR_INK = "#1A1A2E";
const COLOR_INK_SOFT = "#5A5A75";
const COLOR_RULE = "#C9C2B0";
const COLOR_RULE_STRONG = "#A89F88";
const COLOR_OXBLOOD = "#8B1E3F";
const COLOR_PARCHMENT = "#F5F1E8";

function ChartLoadingState(): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden>
      {[0, 1].map((index) => (
        <div
          key={index}
          className="h-[360px] animate-pulse border border-[color:var(--rule)] bg-[color:var(--parchment-deep)]/60"
        />
      ))}
    </div>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-[300px] items-center justify-center border border-dashed border-[color:var(--rule-strong)] px-6 text-center font-serif text-base italic text-[color:var(--ink-soft)]">
      {children}
    </div>
  );
}

function AccessibleCourtData({
  rows,
}: {
  rows: JurisdictionDistributionItem[];
}): React.JSX.Element {
  return (
    <table className="sr-only">
      <caption>United Kingdom judgments by court</caption>
      <thead>
        <tr>
          <th scope="col">Court</th>
          <th scope="col">Judgments</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            <td>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AccessibleYearlyData({
  rows,
}: {
  rows: JurisdictionYearlyItem[];
}): React.JSX.Element {
  return (
    <table className="sr-only">
      <caption>United Kingdom judgments by year</caption>
      <thead>
        <tr>
          <th scope="col">Year</th>
          <th scope="col">Judgments</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.year}>
            <th scope="row">{row.year}</th>
            <td>{row.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatComputedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function UKJudgmentsAnalysisPage(): React.JSX.Element {
  const query = useDashboardStats();
  const ukStats = useMemo(
    () => (query.data ? selectUKDashboardStats(query.data) : null),
    [query.data],
  );

  if (query.isLoading || !ukStats) {
    if (query.isError) {
      const message =
        query.error instanceof Error
          ? query.error.message
          : "An unknown error occurred while loading statistics.";
      return (
        <PageContainer width="wide">
          <EditorialCard
            flat
            eyebrow="United Kingdom corpus"
            title="Unable to load judgment statistics"
            role="alert"
          >
            <p className="font-serif text-base italic text-[color:var(--ink-soft)]">
              {message}
            </p>
            <EditorialButton
              className="mt-5 self-start"
              variant="secondary"
              onClick={() => void query.refetch()}
            >
              Retry
            </EditorialButton>
          </EditorialCard>
        </PageContainer>
      );
    }

    return (
      <PageContainer width="wide">
        <div role="status" aria-live="polite" className="space-y-8">
          <span className="sr-only">
            Loading United Kingdom judgment statistics
          </span>
          <div className="h-28 animate-pulse bg-[color:var(--rule)]/40" />
          <ChartLoadingState />
        </div>
      </PageContainer>
    );
  }

  const hasAnyData =
    ukStats.totalJudgments > 0 ||
    ukStats.topCourts.length > 0 ||
    ukStats.yearlyTrend.length > 0;

  if (!hasAnyData) {
    return (
      <PageContainer width="wide">
        <EditorialCard
          flat
          eyebrow="United Kingdom corpus"
          title="Corpus statistics are not available yet"
          role="status"
        >
          <p className="font-serif text-base italic text-[color:var(--ink-soft)]">
            No United Kingdom judgment statistics are available yet. The page
            will populate when jurisdiction-scoped records are indexed.
          </p>
        </EditorialCard>
      </PageContainer>
    );
  }

  const computedAt = formatComputedAt(ukStats.computedAt);
  const firstYear = ukStats.yearlyTrend.at(0)?.year;
  const lastYear = ukStats.yearlyTrend.at(-1)?.year;
  const yearSpan =
    firstYear === undefined
      ? "No yearly series"
      : firstYear === lastYear
        ? String(firstYear)
        : `${firstYear}–${lastYear}`;
  const displayedCourts = ukStats.topCourts.slice(0, 10);

  return (
    <PageContainer width="wide">
      <header className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <Eyebrow tone="oxblood">Use case · United Kingdom corpus</Eyebrow>
          <Headline as="h1" size="lg" className="mt-4 max-w-4xl">
            United Kingdom judgments, <em>mapped in context</em>
          </Headline>
          <p className="mt-5 max-w-3xl text-[17px] leading-[1.7] text-[color:var(--ink-soft)]">
            Explore the real distribution and yearly coverage of judgments in
            the indexed UK corpus. Every figure below comes from the same
            jurisdiction-scoped statistics that power the JuDDGES archive.
          </p>
        </div>
        <div className="lg:col-span-4 lg:flex lg:justify-end">
          <EditorialButton href="/search" arrow>
            Search the case-law archive
          </EditorialButton>
        </div>
      </header>

      <Rule weight="ink" />

      <section aria-labelledby="uk-coverage-heading">
        <h2 id="uk-coverage-heading" className="sr-only">
          United Kingdom corpus coverage
        </h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div data-testid="uk-total-judgments">
            <Stat
              static
              size="sm"
              value={ukStats.totalJudgments}
              label="UK judgments"
              marker="¹"
            />
          </div>
          <Stat
            static
            size="sm"
            value={displayedCourts.length}
            label="Courts shown"
          />
          <Stat
            static
            size="sm"
            value={ukStats.yearlyTrend.length}
            label="Years represented"
            detail={yearSpan}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartFigure
          figure="01"
          eyebrow="Court distribution"
          title="Leading courts in the indexed UK corpus"
          featured
          caption="Counts include only records explicitly classified with the UK jurisdiction."
          source={computedAt ? `Dashboard snapshot · ${computedAt}` : "Dashboard statistics"}
        >
          {displayedCourts.length === 0 ? (
            <EmptyChart>No UK court distribution is available.</EmptyChart>
          ) : (
            <>
              <div
                role="img"
                aria-label="UK judgments by court"
                className="h-[320px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayedCourts}
                    layout="vertical"
                    margin={{ top: 4, right: 20, bottom: 4, left: 12 }}
                  >
                    <CartesianGrid
                      stroke={COLOR_RULE}
                      strokeDasharray="2 4"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: COLOR_RULE_STRONG }}
                      tickFormatter={(value: number) => formatStatNumber(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={128}
                      tick={{ fill: COLOR_INK, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: COLOR_RULE_STRONG }}
                    />
                    <Tooltip
                      cursor={{ fill: COLOR_PARCHMENT, opacity: 0.5 }}
                      contentStyle={{
                        background: COLOR_PARCHMENT,
                        border: `1px solid ${COLOR_INK}`,
                        borderRadius: 0,
                        color: COLOR_INK,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Judgments"
                      fill={COLOR_INK}
                      radius={[0, 1, 1, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <AccessibleCourtData rows={displayedCourts} />
            </>
          )}
        </ChartFigure>

        <ChartFigure
          figure="02"
          eyebrow="Temporal coverage"
          title="Indexed judgments by year"
          caption="The latest year may be incomplete; figures reflect the current indexed snapshot."
          source={computedAt ? `Dashboard snapshot · ${computedAt}` : "Dashboard statistics"}
        >
          {ukStats.yearlyTrend.length === 0 ? (
            <EmptyChart>No UK yearly trend is available.</EmptyChart>
          ) : (
            <>
              <div
                role="img"
                aria-label="UK judgments by year"
                className="h-[320px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ukStats.yearlyTrend}
                    margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid
                      stroke={COLOR_RULE}
                      strokeDasharray="2 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: COLOR_RULE_STRONG }}
                    />
                    <YAxis
                      tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: COLOR_RULE_STRONG }}
                      tickFormatter={(value: number) => formatStatNumber(value)}
                    />
                    <Tooltip
                      cursor={{ fill: COLOR_PARCHMENT, opacity: 0.5 }}
                      contentStyle={{
                        background: COLOR_PARCHMENT,
                        border: `1px solid ${COLOR_INK}`,
                        borderRadius: 0,
                        color: COLOR_INK,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Judgments"
                      fill={COLOR_OXBLOOD}
                      radius={[1, 1, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <AccessibleYearlyData rows={ukStats.yearlyTrend} />
            </>
          )}
        </ChartFigure>
      </div>

      <section className="grid grid-cols-1 gap-px bg-[color:var(--rule)] lg:grid-cols-12">
        <EditorialCard
          bare
          className="bg-[color:var(--parchment)] lg:col-span-7"
          eyebrow="Research perspective"
          title="Follow institutions and change over time"
        >
          <p className="text-[15px] leading-[1.7] text-[color:var(--ink-soft)]">
            Court distribution shows where the indexed material originates;
            the yearly series reveals the shape and present limits of temporal
            coverage. Together they help researchers assess the corpus before
            moving from discovery into close reading.
          </p>
        </EditorialCard>
        <EditorialCard
          bare
          className="bg-[color:var(--parchment-deep)] lg:col-span-5"
          eyebrow="Evidence, not examples"
          title="A live corpus view"
        >
          <p className="text-[15px] leading-[1.7] text-[color:var(--ink-soft)]">
            These figures are not illustrative case data. They are derived from
            the dashboard statistics endpoint and restricted to records marked
            with the UK jurisdiction.
          </p>
        </EditorialCard>
      </section>
    </PageContainer>
  );
}

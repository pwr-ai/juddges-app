"use client";

import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContentType, TooltipContentProps } from "recharts/types/component/Tooltip";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { useDashboardStats } from "@/lib/api/dashboard";
import { PageContainer } from "@/lib/styles/components";
import {
  EditorialCard,
  Eyebrow,
  Headline,
  Rule,
  Stat,
} from "@/components/editorial";
import { formatStatNumber } from "@/lib/format-stats";
import { cn } from "@/lib/utils";

// Editorial palette references for chart fills.
const COLOR_INK = "#1A1A2E";
const COLOR_INK_SOFT = "#5A5A75";
const COLOR_RULE = "#C9C2B0";
const COLOR_RULE_STRONG = "#A89F88";
const COLOR_OXBLOOD = "#8B1E3F";
const COLOR_GOLD = "#B8954A";
const COLOR_GOLD_SOFT = "#E8DCB8";
const COLOR_PARCHMENT = "#F5F1E8";

// 2025 is a partial-year tail in the source dataset; flag it so users don't
// read the artificially-low bar as a real decline.
const PARTIAL_YEAR_THRESHOLD = 2025;

function makeTooltipRenderer(opts?: {
  valueLabel?: string;
  formatLabel?: (label: string | number) => string;
}): ContentType<ValueType, NameType> {
  const valueLabel = opts?.valueLabel ?? "Judgments";
  const formatLabel = opts?.formatLabel;
  return function EditorialTooltipRender(
    props: TooltipContentProps<ValueType, NameType>,
  ): React.ReactElement | null {
    const { active, payload, label } = props;
    if (!active || !payload || payload.length === 0) return null;
    const displayLabel =
      label !== undefined && formatLabel
        ? formatLabel(label as string | number)
        : label;
    return (
      <div className="border border-[color:var(--ink)] bg-[color:var(--parchment)] px-3 py-2 text-xs shadow-sm">
        {displayLabel !== undefined && displayLabel !== "" && (
          <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-[color:var(--ink-soft)]">
            {displayLabel}
          </div>
        )}
        {payload.map((entry, idx) => {
          const v = entry.value;
          const display =
            typeof v === "number"
              ? v.toLocaleString()
              : Array.isArray(v)
                ? v.join(", ")
                : (v ?? "");
          return (
            <div
              key={idx}
              className="mt-1 flex items-baseline gap-3 font-mono tabular-nums text-[color:var(--ink)]"
            >
              <span>{entry.name ?? valueLabel}</span>
              <span className="font-semibold">{display}</span>
            </div>
          );
        })}
      </div>
    );
  };
}

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="flex w-full items-end gap-2 border border-[color:var(--rule)] bg-[color:var(--parchment-deep)]/40 p-4"
      style={{ height }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse bg-[color:var(--rule)]/70"
          style={{ height: `${30 + ((i * 53) % 70)}%` }}
        />
      ))}
    </div>
  );
}

function StatStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-10 w-24 animate-pulse bg-[color:var(--rule)]/60" />
          <div className="h-3 w-20 animate-pulse bg-[color:var(--rule)]/40" />
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function spanInYears(oldest: string | null, newest: string | null): number | null {
  if (!oldest || !newest) return null;
  const a = new Date(oldest).getTime();
  const b = new Date(newest).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  const years = Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24 * 365.25)));
  return years;
}

const COMPLETENESS_FIELDS: Array<{
  key:
    | "embeddings_pct"
    | "with_summary_pct"
    | "structure_extraction_pct"
    | "with_keywords_pct"
    | "with_legal_topics_pct"
    | "with_cited_legislation_pct"
    | "deep_analysis_pct";
  label: string;
}> = [
  { key: "embeddings_pct", label: "Vector embeddings" },
  { key: "with_summary_pct", label: "AI summaries" },
  { key: "structure_extraction_pct", label: "Structure extracted" },
  { key: "with_keywords_pct", label: "Keywords assigned" },
  { key: "with_legal_topics_pct", label: "Legal topics tagged" },
  { key: "with_cited_legislation_pct", label: "Cited legislation parsed" },
  { key: "deep_analysis_pct", label: "Deep analysis" },
];

const tooltipDefault = makeTooltipRenderer();
const tooltipYearly = makeTooltipRenderer({
  formatLabel: (label) =>
    typeof label === "number" && label >= PARTIAL_YEAR_THRESHOLD
      ? `${label}  (partial)`
      : String(label),
});

export default function StatisticsPage(): React.JSX.Element {
  const { data: stats, isLoading, isError, error } = useDashboardStats();

  const yearlyData = useMemo(() => {
    if (!stats?.decisions_per_year) return [];
    return [...stats.decisions_per_year]
      .sort((a, b) => a.year - b.year)
      .map((row) => ({
        year: row.year,
        count: row.count,
        partial: row.year >= PARTIAL_YEAR_THRESHOLD,
      }));
  }, [stats?.decisions_per_year]);

  const caseTypeData = useMemo(() => {
    if (!stats?.case_types) return [];
    return [...stats.case_types]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats?.case_types]);

  const courtLevelData = useMemo(() => {
    if (!stats?.court_levels) return [];
    return [...stats.court_levels].sort((a, b) => b.count - a.count);
  }, [stats?.court_levels]);

  const topCourts = useMemo(() => {
    if (!stats?.top_courts) return [];
    return [...stats.top_courts].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [stats?.top_courts]);

  if (isError) {
    return (
      <PageContainer width="wide">
        <EditorialCard
          eyebrow="Statistics"
          title="Unable to load database statistics"
          flat
        >
          <p className="font-serif text-base italic text-[color:var(--ink-soft)]">
            {error instanceof Error
              ? error.message
              : "An unknown error occurred while loading dashboard statistics."}
          </p>
        </EditorialCard>
      </PageContainer>
    );
  }

  const totalJudgments = stats?.total_judgments ?? 0;
  const plCount = stats?.jurisdictions?.PL ?? 0;
  const ukCount = stats?.jurisdictions?.UK ?? 0;
  const dateRange = stats?.date_range;
  const oldestLabel = formatDate(dateRange?.oldest ?? null);
  const newestLabel = formatDate(dateRange?.newest ?? null);
  const span = spanInYears(dateRange?.oldest ?? null, dateRange?.newest ?? null);

  return (
    <PageContainer width="wide">
      <header className="flex flex-col gap-3">
        <Eyebrow tone="oxblood">Database Statistics</Eyebrow>
        <Headline as="h1" size="md">
          The <em>archive</em>, in figures
        </Headline>
        <p className="max-w-2xl text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
          A precomputed snapshot of indexed judgments across Polish and UK
          jurisdictions, refreshed on a 4-hour cadence.
        </p>
      </header>

      <Rule weight="ink" />

      <section>
        {isLoading || !stats ? (
          <StatStripSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat
              size="sm"
              value={totalJudgments}
              label="Total Judgments"
              marker="¹"
            />
            <Stat size="sm" value={plCount} label="Poland" />
            <Stat size="sm" value={ukCount} label="United Kingdom" />
            {span !== null ? (
              <Stat
                size="sm"
                static
                value={span}
                suffix="y"
                label="Coverage Span"
                detail={
                  oldestLabel && newestLabel
                    ? `${oldestLabel} – ${newestLabel}`
                    : undefined
                }
              />
            ) : (
              <Stat
                size="sm"
                static
                value={yearlyData.length}
                label="Years Covered"
              />
            )}
          </div>
        )}
      </section>

      <EditorialCard
        eyebrow="Timeline"
        title="Decisions per year"
        action={
          yearlyData.some((d) => d.partial) ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
              <span
                aria-hidden
                className="mr-2 inline-block h-2 w-3 align-middle"
                style={{ backgroundColor: COLOR_GOLD_SOFT, border: `1px dashed ${COLOR_GOLD}` }}
              />
              Partial year
            </span>
          ) : undefined
        }
      >
        {isLoading || !stats ? (
          <ChartSkeleton height={300} />
        ) : (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart
                data={yearlyData}
                margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
              >
                <CartesianGrid stroke={COLOR_RULE} strokeDasharray="2 4" vertical={false} />
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
                  tickFormatter={(v: number) => formatStatNumber(v)}
                />
                <Tooltip
                  cursor={{ fill: COLOR_PARCHMENT, opacity: 0.4 }}
                  content={tooltipYearly}
                />
                <Bar dataKey="count" name="Judgments" radius={[1, 1, 0, 0]}>
                  {yearlyData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.partial ? COLOR_GOLD_SOFT : COLOR_OXBLOOD}
                      stroke={d.partial ? COLOR_GOLD : undefined}
                      strokeDasharray={d.partial ? "3 2" : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </EditorialCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EditorialCard eyebrow="Composition" title="Case type">
          {isLoading || !stats ? (
            <ChartSkeleton height={260} />
          ) : caseTypeData.length === 0 ? (
            <p className="font-serif text-sm italic text-[color:var(--ink-soft)]">
              No case-type data available.
            </p>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart
                  data={caseTypeData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 16 }}
                >
                  <CartesianGrid stroke={COLOR_RULE} strokeDasharray="2 4" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: COLOR_RULE_STRONG }}
                    tickFormatter={(v: number) => formatStatNumber(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fill: COLOR_INK, fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: COLOR_RULE_STRONG }}
                  />
                  <Tooltip
                    cursor={{ fill: COLOR_PARCHMENT, opacity: 0.4 }}
                    content={tooltipDefault}
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
          )}
        </EditorialCard>

        <EditorialCard eyebrow="Hierarchy" title="Court level">
          {isLoading || !stats ? (
            <ChartSkeleton height={260} />
          ) : courtLevelData.length === 0 ? (
            <p className="font-serif text-sm italic text-[color:var(--ink-soft)]">
              No court-level data available.
            </p>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart
                  data={courtLevelData}
                  margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
                >
                  <CartesianGrid stroke={COLOR_RULE} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: COLOR_RULE_STRONG }}
                    interval={0}
                    angle={courtLevelData.length > 4 ? -15 : 0}
                    textAnchor={courtLevelData.length > 4 ? "end" : "middle"}
                    height={courtLevelData.length > 4 ? 60 : 30}
                  />
                  <YAxis
                    tick={{ fill: COLOR_INK_SOFT, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: COLOR_RULE_STRONG }}
                    tickFormatter={(v: number) => formatStatNumber(v)}
                  />
                  <Tooltip
                    cursor={{ fill: COLOR_PARCHMENT, opacity: 0.4 }}
                    content={tooltipDefault}
                  />
                  <Bar dataKey="count" name="Judgments" radius={[1, 1, 0, 0]}>
                    {courtLevelData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.jurisdiction === "UK" ? COLOR_GOLD : COLOR_OXBLOOD}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </EditorialCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <EditorialCard eyebrow="Leaderboard" title="Top issuing courts">
            {isLoading || !stats ? (
              <ul className="divide-y divide-[color:var(--rule)]">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <div className="h-4 w-4 animate-pulse bg-[color:var(--rule)]/60" />
                    <div className="h-4 flex-1 animate-pulse bg-[color:var(--rule)]/40" />
                    <div className="h-4 w-16 animate-pulse bg-[color:var(--rule)]/60" />
                  </li>
                ))}
              </ul>
            ) : topCourts.length === 0 ? (
              <p className="font-serif text-sm italic text-[color:var(--ink-soft)]">
                No top-court data available.
              </p>
            ) : (
              <ol className="divide-y divide-[color:var(--rule)]">
                {topCourts.map((court, idx) => {
                  const pct =
                    totalJudgments > 0
                      ? Math.min(100, (court.count / topCourts[0].count) * 100)
                      : 0;
                  return (
                    <li
                      key={`${court.name}-${idx}`}
                      className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="editorial-citation font-mono text-xs text-[color:var(--ink-soft)] tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[color:var(--ink)]">
                          {court.name}
                        </p>
                        <div className="mt-1.5 h-[2px] w-full bg-[color:var(--rule)]">
                          <div
                            className={cn(
                              "h-full",
                              court.jurisdiction === "UK"
                                ? "bg-[color:var(--gold)]"
                                : "bg-[color:var(--oxblood)]",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-baseline gap-2 text-right">
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
                          {court.jurisdiction ?? ""}
                        </span>
                        <span className="font-mono text-sm tabular-nums text-[color:var(--ink)]">
                          {court.count.toLocaleString()}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </EditorialCard>
        </div>

        <div className="lg:col-span-5">
          <EditorialCard eyebrow="Quality" title="Data completeness">
            {isLoading || !stats ? (
              <ul className="space-y-3">
                {Array.from({ length: 7 }).map((_, i) => (
                  <li key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <div className="h-3 w-32 animate-pulse bg-[color:var(--rule)]/40" />
                      <div className="h-3 w-10 animate-pulse bg-[color:var(--rule)]/60" />
                    </div>
                    <div className="h-[2px] w-full bg-[color:var(--rule)]/60" />
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <ul className="space-y-3">
                  {COMPLETENESS_FIELDS.map(({ key, label }) => {
                    const pct = stats.data_completeness?.[key] ?? 0;
                    return (
                      <li key={key} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-[color:var(--ink)]">
                            {label}
                          </span>
                          <span className="font-mono text-xs tabular-nums text-[color:var(--ink-soft)]">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-[2px] w-full bg-[color:var(--rule)]">
                          <div
                            className="h-full bg-[color:var(--ink)]"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Rule weight="hairline" className="mt-5" />
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
                    Avg. text length
                  </span>
                  <span className="font-mono text-sm tabular-nums text-[color:var(--ink)]">
                    {Math.round(
                      stats.data_completeness?.avg_text_length_chars ?? 0,
                    ).toLocaleString()}{" "}
                    <span className="text-[color:var(--ink-soft)]">chars</span>
                  </span>
                </div>
              </>
            )}
          </EditorialCard>
        </div>
      </div>

      {stats?.computed_at && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          ¹ Snapshot computed{" "}
          <span className="text-[color:var(--ink)]">
            {new Date(stats.computed_at).toLocaleString()}
          </span>{" "}
          · cached for 4 hours
        </p>
      )}
    </PageContainer>
  );
}

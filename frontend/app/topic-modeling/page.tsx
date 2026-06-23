"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ContentType } from "recharts/types/component/Tooltip";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { ArrowDownRight, ArrowUpRight, Minus, FileText } from "lucide-react";
import { PageContainer } from "@/lib/styles/components";
import {
  EditorialButton,
  EditorialCard,
  Eyebrow,
  Headline,
  Rule,
  Stat,
} from "@/components/editorial";
import {
  useTopicModeling,
  DEFAULT_TOPIC_MODELING_REQUEST,
  TREND_META,
  type Topic,
  type TopicTrend,
} from "@/lib/api/topic-modeling";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import { cn } from "@/lib/utils";

// Editorial palette references for chart fills.
const COLOR_INK = "#1A1A2E";
const COLOR_INK_SOFT = "#5A5A75";
const COLOR_RULE = "#C9C2B0";
const COLOR_OXBLOOD = "#8B1E3F";
const COLOR_GOLD = "#B8954A";

const TREND_TONE: Record<
  TopicTrend,
  { icon: React.ElementType; className: string }
> = {
  emerging: { icon: ArrowUpRight, className: "text-[color:var(--oxblood)]" },
  declining: { icon: ArrowDownRight, className: "text-[color:var(--ink-soft)]" },
  stable: { icon: Minus, className: "text-[color:var(--gold)]" },
};

function TrendBadge({ trend }: { trend: TopicTrend }): React.JSX.Element {
  const tone = TREND_TONE[trend];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]",
        tone.className,
      )}
      title={TREND_META[trend].description}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {TREND_META[trend].label}
    </span>
  );
}

const renderTopicTooltip: ContentType<ValueType, NameType> =
  function TopicTooltipRender(props): React.ReactElement | null {
    const { active, payload, label } = props;
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0];
    return (
      <div className="border border-[color:var(--ink)] bg-[color:var(--parchment)] px-3 py-2 text-xs shadow-sm">
        <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-[color:var(--ink-soft)]">
          {String(label)}
        </div>
        <div className="mt-1 text-[color:var(--ink)]">
          Prevalence{" "}
          <span className="font-semibold">
            {typeof point.value === "number"
              ? point.value.toFixed(3)
              : String(point.value)}
          </span>
        </div>
      </div>
    );
  };

function TopicCard({
  topic,
  rank,
  onOpenDocument,
}: {
  topic: Topic;
  rank: number;
  onOpenDocument: (documentId: string) => void;
}): React.JSX.Element {
  const chartData = useMemo(
    () =>
      topic.time_series.map((period) => ({
        period: period.period_label,
        weight: period.topic_weight,
      })),
    [topic.time_series],
  );

  const maxKeywordWeight = topic.keywords[0]?.weight ?? 1;

  return (
    <EditorialCard flat className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--gold)]">
            Topic&nbsp;{String(rank).padStart(2, "0")}
          </span>
          <h3 className="mt-1 font-serif text-xl leading-[1.15] tracking-[-0.01em] text-[color:var(--ink)]">
            {topic.label}
          </h3>
        </div>
        <TrendBadge trend={topic.trend} />
      </header>

      {/* Keyword chips, weighted */}
      <div className="flex flex-wrap gap-1.5">
        {topic.keywords.map((kw) => {
          const intensity = maxKeywordWeight
            ? kw.weight / maxKeywordWeight
            : 0;
          return (
            <span
              key={kw.word}
              className="inline-flex items-center rounded-none border border-[color:var(--rule)] px-2 py-0.5 font-mono text-[11px] tracking-[0.04em] text-[color:var(--ink)]"
              style={{
                backgroundColor: `color-mix(in srgb, var(--gold-soft) ${Math.round(
                  intensity * 100,
                )}%, transparent)`,
              }}
              title={`weight ${kw.weight.toFixed(4)}`}
            >
              {kw.word}
            </span>
          );
        })}
      </div>

      {/* Temporal trend area chart */}
      {chartData.length > 1 && (
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`topic-grad-${topic.topic_id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={COLOR_OXBLOOD} stopOpacity={0.35} />
                  <stop
                    offset="100%"
                    stopColor={COLOR_OXBLOOD}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={COLOR_RULE} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 9, fill: COLOR_INK_SOFT }}
                axisLine={{ stroke: COLOR_RULE }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <Tooltip content={renderTopicTooltip} cursor={{ stroke: COLOR_GOLD }} />
              <Area
                type="monotone"
                dataKey="weight"
                stroke={COLOR_OXBLOOD}
                strokeWidth={1.5}
                fill={`url(#topic-grad-${topic.topic_id})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <Rule weight="hairline" />

      {/* Document-topic associations */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            Representative judgments
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-soft)]">
            {topic.document_count} docs
          </span>
        </div>
        {topic.top_documents.length === 0 ? (
          <p className="font-serif text-sm italic text-[color:var(--ink-soft)]">
            No representative judgments above the relevance threshold.
          </p>
        ) : (
          <ul className="flex flex-col">
            {topic.top_documents.slice(0, 5).map((doc) => (
              <li key={doc.document_id}>
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc.document_id)}
                  className="group flex w-full items-center justify-between gap-3 border-b border-[color:var(--rule)]/60 py-1.5 text-left last:border-b-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText
                      className="h-3.5 w-3.5 flex-shrink-0 text-[color:var(--gold)]"
                      aria-hidden
                    />
                    <span className="truncate text-sm text-[color:var(--ink)] group-hover:text-[color:var(--oxblood)]">
                      {doc.title || doc.document_id}
                    </span>
                  </span>
                  <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--ink-soft)]">
                    {Math.round(doc.relevance * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EditorialCard>
  );
}

function TopicGridSkeleton(): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 border border-[color:var(--rule)] p-5"
        >
          <div className="h-6 w-2/3 animate-pulse bg-[color:var(--rule)]/60" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((__, j) => (
              <div
                key={j}
                className="h-5 w-16 animate-pulse bg-[color:var(--rule)]/40"
              />
            ))}
          </div>
          <div className="h-28 w-full animate-pulse bg-[color:var(--rule)]/30" />
        </div>
      ))}
    </div>
  );
}

export default function TopicModelingPage(): React.JSX.Element {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);

  const { data, isFetching, isError, error, refetch } = useTopicModeling(
    DEFAULT_TOPIC_MODELING_REQUEST,
    { enabled },
  );

  const handleAnalyze = (): void => {
    if (!enabled) {
      setEnabled(true);
    } else {
      void refetch();
    }
  };

  const handleOpenDocument = (documentId: string): void => {
    const cleanId = cleanDocumentIdForUrl(documentId);
    router.push(`/documents/${cleanId}?from=topic-modeling`);
  };

  const topics = data?.topics ?? [];
  const stats = data?.statistics;

  return (
    <PageContainer width="wide">
      <header className="flex flex-col gap-3">
        <Eyebrow tone="oxblood">Topic &amp; Concept Modeling</Eyebrow>
        <Headline as="h1" size="md">
          The <em>themes</em> beneath the corpus
        </Headline>
        <p className="max-w-2xl text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
          Latent topics extracted from indexed judgments via non-negative matrix
          factorization over TF-IDF features. Each topic surfaces its defining
          keywords, how its prevalence shifts across time, and the most
          representative judgments. This is an exploratory aid, not a definitive
          taxonomy.
        </p>
        <div className="mt-1">
          <EditorialButton
            onClick={handleAnalyze}
            loading={isFetching}
            arrow={!isFetching}
          >
            {isFetching
              ? "Analyzing corpus…"
              : data
                ? "Re-run analysis"
                : "Run topic analysis"}
          </EditorialButton>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
            Rate limited · 10 runs / hour
          </p>
        </div>
      </header>

      <Rule weight="ink" />

      {/* Statistics strip */}
      {stats && (
        <section className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat size="sm" value={stats.num_topics} label="Topics" />
          <Stat size="sm" value={stats.total_documents} label="Judgments analyzed" />
          <Stat
            size="sm"
            value={stats.documents_with_dates}
            label="Dated for trends"
          />
          <Stat
            size="sm"
            static
            value={Math.round(stats.avg_topic_coherence * 100)}
            suffix="%"
            label="Avg. coherence"
          />
        </section>
      )}

      {/* States */}
      {isError && (
        <EditorialCard
          eyebrow="Topic Modeling"
          title="Unable to analyze topics"
          flat
        >
          <p className="font-serif text-base italic text-[color:var(--ink-soft)]">
            {error instanceof Error
              ? error.message
              : "An unknown error occurred while analyzing topics."}
          </p>
          <div className="mt-4">
            <EditorialButton variant="secondary" onClick={() => void refetch()}>
              Try again
            </EditorialButton>
          </div>
        </EditorialCard>
      )}

      {!enabled && !data && !isError && (
        <EditorialCard flat bare className="py-12 text-center">
          <p className="font-serif text-lg italic text-[color:var(--ink-soft)]">
            Run an analysis to surface the latent themes across the judgments
            corpus.
          </p>
        </EditorialCard>
      )}

      {isFetching && !data && <TopicGridSkeleton />}

      {!isFetching && enabled && !isError && topics.length === 0 && data && (
        <EditorialCard flat bare className="py-12 text-center">
          <p className="font-serif text-lg italic text-[color:var(--ink-soft)]">
            No topics could be extracted from the current corpus sample.
          </p>
        </EditorialCard>
      )}

      {topics.length > 0 && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {topics.map((topic, index) => (
            <TopicCard
              key={topic.topic_id}
              topic={topic}
              rank={index + 1}
              onOpenDocument={handleOpenDocument}
            />
          ))}
        </section>
      )}

      {stats && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
          Computed in {Math.round(stats.processing_time_ms)} ms
          {stats.date_range_start && stats.date_range_end
            ? ` · ${stats.date_range_start} – ${stats.date_range_end}`
            : ""}
        </p>
      )}
    </PageContainer>
  );
}

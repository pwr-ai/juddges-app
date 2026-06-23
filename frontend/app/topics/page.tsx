"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/contexts/AuthContext";
import {
  useMyTopicClicks,
  useTopicsMeta,
  useTrendingTopics,
  type TrendingTopic,
} from "@/lib/api/topics";
import { PageContainer } from "@/lib/styles/components";
import { EditorialCard, Eyebrow, Headline, Rule } from "@/components/editorial";
import { cn } from "@/lib/utils";

/** Build a /search link that pre-fills the query with a topic label. */
function topicSearchHref(topicId: string): string {
  return `/search?q=${encodeURIComponent(topicId)}`;
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function jurisdictionLabel(value: string | null): string | null {
  if (!value) return null;
  return value.toUpperCase();
}

function ListSkeleton({ rows = 6 }: { rows?: number }): React.JSX.Element {
  return (
    <ul className="divide-y divide-[color:var(--rule)]">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <div className="h-4 w-4 animate-pulse bg-[color:var(--rule)]/60" />
          <div className="h-4 flex-1 animate-pulse bg-[color:var(--rule)]/40" />
          <div className="h-4 w-16 animate-pulse bg-[color:var(--rule)]/60" />
        </li>
      ))}
    </ul>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="font-serif text-sm italic text-[color:var(--ink-soft)]">
      {children}
    </p>
  );
}

/** Tiny stacked PL/UK bar visualising the cross-lingual click split. */
function JurisdictionSplitBar({
  topic,
}: {
  topic: TrendingTopic;
}): React.JSX.Element {
  const total = Math.max(1, topic.click_count);
  const plPct = (topic.pl_count / total) * 100;
  const ukPct = (topic.uk_count / total) * 100;
  const otherPct = (topic.other_count / total) * 100;
  return (
    <div
      className="flex h-[3px] w-full overflow-hidden bg-[color:var(--rule)]"
      role="img"
      aria-label={`PL ${topic.pl_count}, UK ${topic.uk_count}, other ${topic.other_count}`}
    >
      <span
        className="h-full bg-[color:var(--oxblood)]"
        style={{ width: `${plPct}%` }}
      />
      <span
        className="h-full bg-[color:var(--gold)]"
        style={{ width: `${ukPct}%` }}
      />
      <span
        className="h-full bg-[color:var(--rule-strong)]"
        style={{ width: `${otherPct}%` }}
      />
    </div>
  );
}

export default function TopicsPage(): React.JSX.Element {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  const { data: meta } = useTopicsMeta();
  const {
    data: trending,
    isLoading: trendingLoading,
    isError: trendingError,
  } = useTrendingTopics(30, 20);
  const {
    data: myClicks,
    isLoading: myClicksLoading,
    isError: myClicksError,
  } = useMyTopicClicks(isAuthenticated, 30, 50);

  // Cross-lingual comparison: pick two trending topics to compare side by side.
  const [leftTopic, setLeftTopic] = useState<string>("");
  const [rightTopic, setRightTopic] = useState<string>("");

  const trendingById = useMemo(() => {
    const map = new Map<string, TrendingTopic>();
    (trending ?? []).forEach((t) => map.set(t.topic_id, t));
    return map;
  }, [trending]);

  const left = leftTopic ? trendingById.get(leftTopic) : undefined;
  const right = rightTopic ? trendingById.get(rightTopic) : undefined;

  const metaLine = useMemo(() => {
    if (!meta || meta.total_concepts === 0) return null;
    const parts: string[] = [];
    const generated = formatDateTime(meta.generated_at);
    if (generated) parts.push(`Snapshot from ${generated}`);
    parts.push(
      `${meta.total_concepts.toLocaleString()} topic${meta.total_concepts === 1 ? "" : "s"}`,
    );
    if (meta.jurisdictions.length > 0) {
      parts.push(meta.jurisdictions.map((j) => j.toUpperCase()).join("+"));
    }
    return parts.join(" · ");
  }, [meta]);

  return (
    <PageContainer width="wide">
      <header className="flex flex-col gap-3">
        <Eyebrow tone="oxblood">Topic Trends</Eyebrow>
        <Headline as="h1" size="md">
          What the corpus is <em>exploring</em>
        </Headline>
        <p className="max-w-2xl text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
          Trending legal topics across Polish and UK case-law, drawn from how
          researchers navigate the corpus. Pick a topic to start a search, or
          compare two side by side.
        </p>
      </header>

      <Rule weight="ink" />

      {/* Trending topics with PL/UK split */}
      <EditorialCard
        eyebrow="Last 30 days"
        title="Trending topics"
        action={
          <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-2 w-3 bg-[color:var(--oxblood)]"
              />
              PL
            </span>
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-2 w-3 bg-[color:var(--gold)]"
              />
              UK
            </span>
          </span>
        }
      >
        {trendingLoading ? (
          <ListSkeleton rows={8} />
        ) : trendingError ? (
          <EmptyNote>Unable to load trending topics right now.</EmptyNote>
        ) : !trending || trending.length === 0 ? (
          <EmptyNote>
            No topic activity yet. Topic trends appear once researchers start
            exploring topic chips in search.
          </EmptyNote>
        ) : (
          <ol className="divide-y divide-[color:var(--rule)]">
            {trending.map((topic, idx) => (
              <li
                key={topic.topic_id}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="editorial-citation font-mono text-xs tabular-nums text-[color:var(--ink-soft)]">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <Link
                    href={topicSearchHref(topic.topic_id)}
                    prefetch={false}
                    className="truncate text-sm font-medium text-[color:var(--ink)] underline-offset-4 hover:text-[color:var(--oxblood)] hover:underline"
                  >
                    {topic.topic_id}
                  </Link>
                  <div className="mt-1.5">
                    <JurisdictionSplitBar topic={topic} />
                  </div>
                </div>
                <div className="flex items-baseline gap-3 text-right font-mono text-xs tabular-nums text-[color:var(--ink-soft)]">
                  <span title="Poland clicks">
                    PL{" "}
                    <span className="text-[color:var(--oxblood)]">
                      {topic.pl_count}
                    </span>
                  </span>
                  <span title="UK clicks">
                    UK{" "}
                    <span className="text-[color:var(--gold)]">
                      {topic.uk_count}
                    </span>
                  </span>
                  <span
                    className="text-sm font-semibold text-[color:var(--ink)]"
                    title="Total clicks"
                  >
                    {topic.click_count}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </EditorialCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Your topics */}
        <EditorialCard eyebrow="Your activity" title="Your topics">
          {!isAuthenticated ? (
            <EmptyNote>
              <Link
                href="/auth/login"
                className="text-[color:var(--oxblood)] underline underline-offset-4"
              >
                Sign in
              </Link>{" "}
              to see the topics you&rsquo;ve recently explored.
            </EmptyNote>
          ) : myClicksLoading ? (
            <ListSkeleton rows={5} />
          ) : myClicksError ? (
            <EmptyNote>Unable to load your topics right now.</EmptyNote>
          ) : !myClicks || myClicks.length === 0 ? (
            <EmptyNote>
              You haven&rsquo;t explored any topics yet. Click a topic chip in
              search to start.
            </EmptyNote>
          ) : (
            <ol className="divide-y divide-[color:var(--rule)]">
              {myClicks.map((click) => {
                const when = formatDateTime(click.last_clicked);
                const jur = jurisdictionLabel(click.jurisdiction);
                return (
                  <li
                    key={click.topic_id}
                    className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={topicSearchHref(click.topic_id)}
                        prefetch={false}
                        className="truncate text-sm font-medium text-[color:var(--ink)] underline-offset-4 hover:text-[color:var(--oxblood)] hover:underline"
                      >
                        {click.topic_id}
                      </Link>
                      {when && (
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
                          {when}
                          {jur ? ` · ${jur}` : ""}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-xs tabular-nums text-[color:var(--ink-soft)]">
                      {click.click_count}×
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </EditorialCard>

        {/* Compare jurisdictions */}
        <EditorialCard eyebrow="Cross-lingual" title="Compare jurisdictions">
          {!trending || trending.length === 0 ? (
            <EmptyNote>
              Trending data is needed to compare topics. Check back once the
              corpus has topic activity.
            </EmptyNote>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <TopicSelect
                  label="Topic A"
                  value={leftTopic}
                  onChange={setLeftTopic}
                  options={trending}
                />
                <TopicSelect
                  label="Topic B"
                  value={rightTopic}
                  onChange={setRightTopic}
                  options={trending}
                />
              </div>

              {left && right ? (
                <div className="grid grid-cols-2 gap-4">
                  <CompareColumn topic={left} />
                  <CompareColumn topic={right} />
                </div>
              ) : (
                <EmptyNote>
                  Select two topics above to compare their PL/UK click frequency.
                </EmptyNote>
              )}
            </div>
          )}
        </EditorialCard>
      </div>

      {metaLine && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
          {metaLine}
        </p>
      )}
    </PageContainer>
  );
}

function TopicSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: TrendingTopic[];
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full border border-[color:var(--rule-strong)] bg-[color:var(--parchment)]",
          "px-2 py-1.5 text-sm text-[color:var(--ink)]",
          "focus:border-[color:var(--ink)] focus:outline-none",
        )}
      >
        <option value="">Select a topic…</option>
        {options.map((t) => (
          <option key={t.topic_id} value={t.topic_id}>
            {t.topic_id}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareColumn({ topic }: { topic: TrendingTopic }): React.JSX.Element {
  return (
    <div className="space-y-2 border-t border-[color:var(--ink)] pt-3">
      <Link
        href={topicSearchHref(topic.topic_id)}
        prefetch={false}
        className="block truncate text-sm font-medium text-[color:var(--ink)] underline-offset-4 hover:text-[color:var(--oxblood)] hover:underline"
      >
        {topic.topic_id}
      </Link>
      <JurisdictionSplitBar topic={topic} />
      <dl className="space-y-1 font-mono text-xs tabular-nums">
        <div className="flex items-baseline justify-between">
          <dt className="text-[color:var(--ink-soft)]">PL</dt>
          <dd className="text-[color:var(--oxblood)]">{topic.pl_count}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-[color:var(--ink-soft)]">UK</dt>
          <dd className="text-[color:var(--gold)]">{topic.uk_count}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-[color:var(--rule)] pt-1">
          <dt className="text-[color:var(--ink-soft)]">Total</dt>
          <dd className="font-semibold text-[color:var(--ink)]">
            {topic.click_count}
          </dd>
        </div>
      </dl>
    </div>
  );
}

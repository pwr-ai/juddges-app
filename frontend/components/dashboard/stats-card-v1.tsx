"use client";

/**
 * VERSION 1: Horizontal Stats Bar
 * - Clean horizontal layout with large numbers
 * - Progress bars for jurisdiction breakdown
 * - Data completeness metrics
 * - Date range display
 * - Top legal domains
 */

import { useEffect, useState, useRef } from "react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { Scale, Clock, BarChart2, CalendarRange } from "lucide-react";
import type { DashboardStats } from "@/lib/api/dashboard";

function AnimatedNumber({ value }: { value: number | undefined | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const spring = useSpring(0, { duration: 1500, bounce: 0 });
  const [displayValue, setDisplayValue] = useState("0");
  const safeValue = value ?? 0;

  const display = useTransform(spring, (current) => {
    if (current >= 1_000_000) return `${(current / 1_000_000).toFixed(1)}M`;
    if (current >= 1_000) return `${Math.floor(current / 1_000)}K`;
    return Math.floor(current).toLocaleString();
  });

  useEffect(() => {
    if (isInView) spring.set(safeValue);
  }, [isInView, spring, safeValue]);

  useEffect(() => display.on("change", setDisplayValue), [display]);

  return <span ref={ref}>{displayValue}</span>;
}

function ProgressBar({ percentage, colorClass }: { percentage: number; colorClass: string }) {
  return (
    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${colorClass}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percentage, 100)}%` }}
        transition={{ duration: 1, delay: 0.4 }}
      />
    </div>
  );
}

function formatDateShort(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "—";
  return date.getFullYear().toString();
}

interface StatsCardV1Props {
  stats: DashboardStats;
  formatLastUpdated: (date: string | null) => { value: string; label: string };
}

export function StatsCardV1({ stats, formatLastUpdated }: StatsCardV1Props) {
  const lastUpdated = formatLastUpdated(stats.computed_at ?? null);
  const totalJudgments = stats.total_judgments ?? 0;
  const plCount = stats.jurisdictions?.PL ?? 0;
  const ukCount = stats.jurisdictions?.UK ?? 0;
  const plPct = totalJudgments > 0 ? (plCount / totalJudgments) * 100 : 0;
  const ukPct = totalJudgments > 0 ? Math.max((ukCount / totalJudgments) * 100, ukCount > 0 ? 5 : 0) : 0;

  const completeness = stats.data_completeness;
  const topDomains = (stats.top_legal_domains ?? []).slice(0, 5);
  const maxDomainCount = topDomains.length > 0 ? Math.max(...topDomains.map((d) => d.count)) : 1;

  const formatK = (n: number | undefined | null): string => {
    if (n === undefined || n === null) return "0";
    return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toString();
  };

  return (
    <div className="space-y-3">
      {/* Total Judgments */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Judgments
              </p>
              <p className="text-3xl font-bold text-foreground leading-none mt-0.5">
                <AnimatedNumber value={totalJudgments} />
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>🇵🇱 {formatK(plCount)}</div>
            <div>🇬🇧 {formatK(ukCount)}</div>
          </div>
        </div>
        {/* Jurisdiction bars */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm w-5">🇵🇱</span>
            <div className="flex-1">
              <ProgressBar percentage={plPct} colorClass="bg-gradient-to-r from-blue-500 to-blue-400" />
            </div>
            <span className="text-xs font-medium w-10 text-right text-muted-foreground">{Math.round(plPct)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm w-5">🇬🇧</span>
            <div className="flex-1">
              <ProgressBar percentage={ukPct} colorClass="bg-gradient-to-r from-red-500 to-red-400" />
            </div>
            <span className="text-xs font-medium w-10 text-right text-muted-foreground">{Math.round(ukPct)}%</span>
          </div>
        </div>
      </motion.div>

      {/* Data Completeness */}
      {completeness && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <BarChart2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Data Completeness
            </span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Embeddings", pct: completeness.embeddings_pct },
              { label: "Structure", pct: completeness.structure_extraction_pct },
              { label: "Deep Analysis", pct: completeness.deep_analysis_pct },
              { label: "Summaries", pct: completeness.with_summary_pct },
            ].map(({ label, pct }) => (
              <div key={label} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-foreground">{Math.round(pct)}%</span>
                </div>
                <ProgressBar
                  percentage={pct}
                  colorClass="bg-gradient-to-r from-emerald-500 to-teal-400"
                />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Date Range + Top Domains row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Date Range */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <CalendarRange className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Date Range
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">From</span>
              <span className="text-xs font-semibold text-foreground">
                {formatDateShort(stats.date_range?.oldest ?? null)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">To</span>
              <span className="text-xs font-semibold text-foreground">
                {formatDateShort(stats.date_range?.newest ?? null)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Top Legal Domains */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Scale className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Top Domains
            </span>
          </div>
          {topDomains.length > 0 ? (
            <div className="space-y-1.5">
              {topDomains.map((domain) => (
                <div key={domain.name} className="space-y-0.5">
                  <span className="text-xs text-muted-foreground truncate block leading-none">
                    {domain.name}
                  </span>
                  <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(domain.count / maxDomainCount) * 100}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60">No data</p>
          )}
        </motion.div>
      </div>

      {/* Last Updated Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-500" />
          <span className="text-sm text-muted-foreground">Last updated</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-emerald-600">{lastUpdated.value}</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}

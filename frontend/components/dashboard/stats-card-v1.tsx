"use client";

/**
 * VERSION 1: Horizontal Stats Bar
 * - Clean horizontal layout with large numbers
 * - Progress bars for country breakdown
 * - Minimal, modern design
 */

import { useEffect, useState, useRef } from "react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { Scale, Globe, Clock, Database } from "lucide-react";

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

interface StatsCardV1Props {
 stats: {
  total_documents: number;
  judgments?: number;
  judgments_pl?: number;
  judgments_uk?: number;
  last_updated?: string | null;
 };
 formatLastUpdated: (date: string | null) => { value: string; label: string };
}

export function StatsCardV1({ stats, formatLastUpdated }: StatsCardV1Props) {
 const lastUpdated = formatLastUpdated(stats.last_updated ?? null);
 const totalJudgments = stats.judgments ?? stats.total_documents;
 const formatK = (n: number | undefined | null) => {
 if (n === undefined || n === null) return"0";
 return n >= 1000 ? `${(n/1000).toFixed(0)}K` : n.toString();
 };

 return (
 <div className="space-y-4">
 {/* Main Stats Row */}
 <div className="grid grid-cols-2 gap-3">
 {/* Total */}
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="col-span-2 p-4 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20"
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
 <Database className="w-5 h-5 text-white"/>
 </div>
 <div>
 <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Collection</p>
 <p className="text-3xl font-bold text-foreground">
 <AnimatedNumber value={totalJudgments} />
 </p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-xs text-muted-foreground">Judgments</p>
 <p className="text-sm font-medium text-violet-600">Poland + United Kingdom</p>
 </div>
 </div>
 </motion.div>

 {/* Judgments */}
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20"
 >
 <div className="flex items-center gap-2 mb-3">
 <Scale className="w-4 h-4 text-blue-500"/>
 <span className="text-xs font-medium text-muted-foreground uppercase">Judgments</span>
 </div>
 <p className="text-2xl font-bold text-foreground mb-3">
 <AnimatedNumber value={stats.judgments} />
 </p>
 {/* Country bars */}
 <div className="space-y-2">
 <div className="flex items-center gap-2">
 <span className="text-sm">🇵🇱</span>
 <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
 <motion.div
 className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
 initial={{ width: 0 }}
 animate={{ width: `${stats.judgments ? ((stats.judgments_pl ?? 0) / stats.judgments) * 100 : 0}%` }}
 transition={{ duration: 1, delay: 0.5 }}
 />
 </div>
 <span className="text-xs font-medium w-12 text-right">{formatK(stats.judgments_pl)}</span>
 </div>
 <div className="flex items-center gap-2">
 <span className="text-sm">🇬🇧</span>
 <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
 <motion.div
 className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full"
 initial={{ width: 0 }}
 animate={{ width: `${stats.judgments ? Math.max(((stats.judgments_uk ?? 0) / stats.judgments) * 100, (stats.judgments_uk ?? 0) > 0 ? 5 : 0) : 0}%` }}
 transition={{ duration: 1, delay: 0.6 }}
 />
 </div>
 <span className="text-xs font-medium w-12 text-right">{formatK(stats.judgments_uk)}</span>
 </div>
 </div>
 </motion.div>

 {/* Coverage */}
 <motion.div
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 }}
 className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20"
 >
 <div className="flex items-center gap-2 mb-3">
 <Globe className="w-4 h-4 text-emerald-500"/>
 <span className="text-xs font-medium text-muted-foreground uppercase">Jurisdictions</span>
 </div>
 <p className="text-2xl font-bold text-foreground mb-3">
 <AnimatedNumber value={2} />
 </p>
 <div className="space-y-2">
 <div className="flex items-center justify-between rounded-xl bg-white/50 px-3 py-2">
 <span className="text-sm font-medium text-foreground/80">🇵🇱 Poland</span>
 <span className="text-xs font-medium text-foreground">{formatK(stats.judgments_pl)}</span>
 </div>
 <div className="flex items-center justify-between rounded-xl bg-white/50 px-3 py-2">
 <span className="text-sm font-medium text-foreground/80">🇬🇧 United Kingdom</span>
 <span className="text-xs font-medium text-foreground">{formatK(stats.judgments_uk)}</span>
 </div>
 </div>
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
 <Clock className="w-4 h-4 text-emerald-500"/>
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

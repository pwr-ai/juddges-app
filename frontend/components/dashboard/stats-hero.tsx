"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useInView, useSpring, useTransform, useScroll } from "framer-motion";
import { Scale, FileText, Clock, Database, TrendingUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Animated counter component
function AnimatedNumber({ value, duration = 2.5 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const spring = useSpring(0, { duration: duration * 1000, bounce: 0 });
  const [displayValue, setDisplayValue] = useState("0");

  const display = useTransform(spring, (current) => {
    if (current >= 1_000_000) {
      return `${(current / 1_000_000).toFixed(1)}M`;
    }
    if (current >= 1_000) {
      return `${Math.floor(current / 1_000)}K`;
    }
    return Math.floor(current).toLocaleString();
  });

  useEffect(() => {
    if (isInView) spring.set(value);
  }, [isInView, spring, value]);

  useEffect(() => {
    return display.on("change", (v) => setDisplayValue(v));
  }, [display]);

  return <span ref={ref}>{displayValue}</span>;
}

// Circular progress ring
function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 8,
  color = "from-blue-500 to-cyan-500"
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const ref = useRef<SVGCircleElement>(null);
  const isInView = useInView(ref, { once: true });
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? (value / max) * 100 : 0;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/20"
      />
      {/* Progress circle */}
      <motion.circle
        ref={ref}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#gradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={isInView ? { strokeDashoffset: circumference - (percent / 100) * circumference } : {}}
        transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
      />
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Country stat row with animated bar
function CountryStat({
  flag,
  country,
  count,
  total,
  color,
  delay = 0
}: {
  flag: string;
  country: string;
  count: number;
  total: number;
  color: string;
  delay?: number;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.floor(n / 1_000)}K`;
    return n.toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay }}
      viewport={{ once: true }}
      className="flex items-center gap-3"
    >
      <span className="text-2xl">{flag}</span>
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-foreground/80">{country}</span>
          <span className="text-sm font-bold">{formatCount(count)}</span>
        </div>
        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", color)}
            initial={{ width: 0 }}
            whileInView={{ width: `${Math.max(percent, count > 0 ? 2 : 0)}%` }}
            transition={{ duration: 1, delay: delay + 0.3, ease: "easeOut" }}
            viewport={{ once: true }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Main stat card
function MainStatCard({
  title,
  subtitle,
  value,
  icon: Icon,
  gradient,
  iconGradient,
  delay = 0,
  children,
}: {
  title: string;
  subtitle: string;
  value: number;
  icon: React.ElementType;
  gradient: string;
  iconGradient: string;
  delay?: number;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      viewport={{ once: true, margin: "-50px" }}
      whileHover={{ y: -8, transition: { duration: 0.3 } }}
      className="group relative"
    >
      {/* Glow effect */}
      <div className={cn(
        "absolute -inset-1 rounded-3xl opacity-0 blur-2xl transition-all duration-500 group-hover:opacity-40",
        gradient
      )} />

      <div className="relative h-full overflow-hidden rounded-3xl bg-card/90 backdrop-blur-xl border border-white/10 dark:border-white/5 p-8">
        {/* Background decoration */}
        <div className={cn(
          "absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-30",
          gradient
        )} />

        {/* Icon */}
        <motion.div
          className={cn("inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6", iconGradient)}
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <Icon className="w-8 h-8 text-white" />
        </motion.div>

        {/* Content */}
        <div className="relative space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{subtitle}</p>
          <h3 className={cn("text-5xl sm:text-6xl font-bold tracking-tight bg-clip-text text-transparent", gradient)}>
            <AnimatedNumber value={value} />
          </h3>
          <p className="text-xl font-semibold text-foreground/90">{title}</p>
        </div>

        {/* Children (country breakdown) */}
        {children && (
          <div className="mt-6 pt-6 border-t border-border/50">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Last updated card with pulse
function LastUpdatedCard({ value, label, delay = 0 }: { value: string; label: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      viewport={{ once: true, margin: "-50px" }}
      whileHover={{ y: -8, transition: { duration: 0.3 } }}
      className="group relative"
    >
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 blur-2xl transition-all duration-500 group-hover:opacity-40" />

      <div className="relative h-full overflow-hidden rounded-3xl bg-card/90 backdrop-blur-xl border border-white/10 dark:border-white/5 p-8">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 opacity-20 blur-3xl" />

        <motion.div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-6"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          <Clock className="w-8 h-8 text-white" />
        </motion.div>

        <div className="relative space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Always Current</p>
          <motion.h3
            className="text-5xl sm:text-6xl font-bold tracking-tight bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            viewport={{ once: true }}
          >
            {value}
          </motion.h3>
          <p className="text-xl font-semibold text-foreground/90">{label}</p>
        </div>

        {/* Live indicator */}
        <motion.div
          className="mt-6 pt-6 border-t border-border/50 flex items-center gap-3"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          viewport={{ once: true }}
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-sm font-medium text-muted-foreground">Database synced & live</span>
        </motion.div>
      </div>
    </motion.div>
  );
}

interface StatsHeroProps {
  stats: {
    total_documents: number;
    judgments: number;
    judgments_pl: number;
    judgments_uk: number;
    tax_interpretations: number;
    tax_interpretations_pl: number;
    tax_interpretations_uk: number;
    last_updated: string | null;
  };
  formatLastUpdated: (date: string | null) => { value: string; label: string };
}

export function StatsHero({ stats, formatLastUpdated }: StatsHeroProps) {
  const lastUpdated = formatLastUpdated(stats.last_updated);
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);

  return (
    <section className="relative min-h-[90vh] flex flex-col justify-center py-12 sm:py-16 lg:py-20">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-violet-500/20 to-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4">
        {/* Header */}
        <motion.div
          className="text-center mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Real-time Database Statistics</span>
          </motion.div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Comprehensive Legal
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary via-violet-500 to-purple-500 bg-clip-text text-transparent">
              Document Database
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Access millions of court judgments and tax interpretations from Poland and the United Kingdom
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Total Documents */}
          <MainStatCard
            title="Legal Documents"
            subtitle="Total Collection"
            value={stats.total_documents}
            icon={Database}
            gradient="bg-gradient-to-r from-violet-500 to-purple-500"
            iconGradient="bg-gradient-to-br from-violet-500 to-purple-600"
            delay={0}
          />

          {/* Court Judgments */}
          <MainStatCard
            title="Court Judgments"
            subtitle="All Court Levels"
            value={stats.judgments}
            icon={Scale}
            gradient="bg-gradient-to-r from-blue-500 to-cyan-500"
            iconGradient="bg-gradient-to-br from-blue-500 to-cyan-600"
            delay={0.1}
          >
            <div className="space-y-3">
              <CountryStat
                flag="🇵🇱"
                country="Poland"
                count={stats.judgments_pl ?? 0}
                total={stats.judgments}
                color="bg-gradient-to-r from-blue-500 to-blue-600"
                delay={0.4}
              />
              <CountryStat
                flag="🇬🇧"
                country="United Kingdom"
                count={stats.judgments_uk ?? 0}
                total={stats.judgments}
                color="bg-gradient-to-r from-red-500 to-red-600"
                delay={0.5}
              />
            </div>
          </MainStatCard>

          {/* Tax Interpretations */}
          <MainStatCard
            title="Tax Interpretations"
            subtitle="Eureka & HMRC"
            value={stats.tax_interpretations}
            icon={FileText}
            gradient="bg-gradient-to-r from-orange-500 to-amber-500"
            iconGradient="bg-gradient-to-br from-orange-500 to-amber-600"
            delay={0.2}
          >
            <div className="space-y-3">
              <CountryStat
                flag="🇵🇱"
                country="Poland"
                count={stats.tax_interpretations_pl ?? 0}
                total={stats.tax_interpretations}
                color="bg-gradient-to-r from-blue-500 to-blue-600"
                delay={0.5}
              />
              <CountryStat
                flag="🇬🇧"
                country="United Kingdom"
                count={stats.tax_interpretations_uk ?? 0}
                total={stats.tax_interpretations}
                color="bg-gradient-to-r from-red-500 to-red-600"
                delay={0.6}
              />
            </div>
          </MainStatCard>

          {/* Last Updated */}
          <LastUpdatedCard
            value={lastUpdated.value}
            label={lastUpdated.label || "Last Updated"}
            delay={0.3}
          />
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{ opacity }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <span className="text-xs text-muted-foreground">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  );
}

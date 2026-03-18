"use client";

import React from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  MessageSquare,
  Search,
  Zap,
  ArrowRight,
  GraduationCap,
  Scale,
  FileText,
  Database,
  Shield,
  Globe,
  Lock,
  BookOpen,
  Landmark,
  Users,
  FlaskConical,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface LandingStats {
  total_documents: number;
  judgments?: number;
  judgments_pl?: number;
  judgments_uk?: number;
  last_updated?: string | null;
}

interface LandingPageProps {
  stats?: LandingStats | null;
  statsLoading?: boolean;
}

const demoQueries = [
  {
    label: "Frankowicze i abuzywne klauzule",
    href: "/search?q=frankowicze%20i%20abuzywne%20klauzule&lang=pl&mode=thinking&type=judgment",
  },
  {
    label: "Murder conviction appeal",
    href: "/search?q=murder%20conviction%20appeal&lang=en&mode=thinking&type=judgment",
  },
  {
    label: "Skarga do sądu administracyjnego",
    href: "/search?q=skarga%20do%20s%C4%85du%20administracyjnego&lang=pl&mode=thinking&type=judgment",
  },
  {
    label: "Consumer protection in financial services",
    href: "/search?q=consumer%20protection%20in%20financial%20services&lang=en&mode=thinking&type=judgment",
  },
] as const;

// ─────────────────────────────────────────────
// Animated number counter (simplified)
// ─────────────────────────────────────────────

function AnimatedStat({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const duration = 2000;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * value);

      if (current >= 1_000_000) {
        setDisplay(`${(current / 1_000_000).toFixed(1)}M`);
      } else if (current >= 1_000) {
        setDisplay(`${Math.floor(current / 1_000).toLocaleString()}K`);
      } else {
        setDisplay(current.toLocaleString());
      }

      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

// ─────────────────────────────────────────────
// Section wrapper with fade-in
// ─────────────────────────────────────────────

function Section({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cn("py-20 md:py-28", className)}
    >
      {children}
    </motion.section>
  );
}

// ─────────────────────────────────────────────
// Section 1: Hero
// ─────────────────────────────────────────────

function HeroSection({ stats, statsLoading }: LandingPageProps) {
  const totalJudgments = stats?.judgments ?? stats?.total_documents ?? 0;

  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden">
      {/* Warm subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/[0.03]" />

      {/* Content */}
      <div className="relative w-full max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        <div className="max-w-3xl">
          {/* University badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2.5 text-sm text-muted-foreground mb-10"
          >
            <div className="p-1.5 rounded-lg bg-primary/8">
              <GraduationCap className="size-4 text-primary" />
            </div>
            <span className="font-medium tracking-wide">
              Wroclaw University of Science and Technology
            </span>
          </motion.div>

          {/* Headline - Instrument Serif */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl sm:text-6xl lg:text-7xl font-normal leading-[0.95] tracking-[-0.02em] text-foreground mb-6"
          >
            <span className="text-primary">JuDDGES</span>
            <br />
            <span className="text-3xl sm:text-4xl lg:text-5xl text-muted-foreground/80">Judicial Decision Data</span>
            <br />
            <span className="text-3xl sm:text-4xl lg:text-5xl text-muted-foreground/80">Gathering, Encoding &amp; Sharing</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-10"
          >
            An open-source research platform for searching and analyzing court judgments from Poland and England &amp; Wales with AI-powered semantic search and structured data extraction.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 mb-16"
          >
            <Button size="lg" asChild className="h-13 px-8 text-base group shadow-md hover:shadow-lg transition-shadow duration-200">
              <Link href="/search">
                Try search
                <ArrowRight className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-200 ease-out" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-13 px-8 text-base hover:shadow-md transition-shadow duration-200">
              <Link href="/auth/sign-up">Create free account</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-12"
          >
            <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground mb-4">
              Popular demo queries
            </p>
            <div className="flex flex-wrap gap-3">
              {demoQueries.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Inline stat strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-wrap gap-8 md:gap-12 text-sm text-muted-foreground"
          >
            <div>
              <span className="block text-2xl font-semibold text-foreground tabular-nums">
                {statsLoading ? (
                  <span className="inline-block w-16 h-7 bg-muted/40 rounded animate-pulse" />
                ) : (
                  <AnimatedStat value={totalJudgments} suffix="+" />
                )}
              </span>
              <span>Judgments indexed</span>
            </div>
            <div>
              <span className="block text-2xl font-semibold text-foreground">2</span>
              <span>Jurisdictions</span>
            </div>
            <div>
              <span className="block text-2xl font-semibold text-foreground">Free</span>
              <span>Academic access</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Section 2: Capabilities Showcase
// ─────────────────────────────────────────────

const capabilities = [
  {
    icon: Search,
    title: "Semantic Search",
    description:
      "Find relevant cases by meaning, not just keywords. Our AI understands legal concepts and retrieves judgments based on semantic similarity across millions of documents.",
    features: ["Full-text & vector search", "Cross-jurisdiction results", "Advanced filters by court, date, topic"],
    href: "/search",
    cta: "Try search",
  },
  {
    icon: MessageSquare,
    title: "AI Legal Assistant",
    description:
      "Ask questions in natural language and get answers grounded in actual court decisions. Every response includes citations to specific judgments.",
    features: ["Citation-backed answers", "Multi-turn conversations", "Case law reasoning"],
    href: "/chat",
    cta: "Start a conversation",
  },
  {
    icon: Zap,
    title: "Schema Extraction",
    description:
      "Define custom data schemas and let AI agents extract structured information from legal documents at scale. Build datasets from raw judgments.",
    features: ["Custom field definitions", "Batch processing", "Export structured data"],
    href: "/schema-chat",
    cta: "Create a schema",
  },
] as const;

function CapabilitiesSection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        {/* Section header */}
        <div className="max-w-2xl mb-16">
          <p className="text-sm font-medium text-primary uppercase tracking-[0.1em] mb-3">
            Capabilities
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.02em] text-foreground leading-tight mb-4">
            Three ways to work
            <br />
            with legal data
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Search, analyze, and extract structured information from court judgments across jurisdictions.
          </p>
        </div>

        {/* Capability cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="group h-full flex flex-col rounded-2xl border border-border bg-card p-8 transition-all duration-200 ease-out hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                {/* Icon */}
                <div className="mb-6 p-3 w-fit rounded-xl bg-primary/8">
                  <cap.icon className="size-6 text-primary" />
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold text-foreground mb-3 tracking-[-0.01em]">
                  {cap.title}
                </h3>

                {/* Description */}
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-6">
                  {cap.description}
                </p>

                {/* Feature list */}
                <ul className="space-y-2.5 mb-8 flex-1">
                  {cap.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                      <div className="mt-1.5 size-1.5 rounded-full bg-primary/60 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={cap.href}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all duration-200"
                >
                  {cap.cta}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 3: Data Authority
// ─────────────────────────────────────────────

function DataAuthoritySection({ stats, statsLoading }: LandingPageProps) {
  const totalJudgments = stats?.judgments ?? stats?.total_documents ?? 0;
  const statItems = [
    {
      icon: Database,
      value: totalJudgments,
      label: "Total judgments",
      detail: "Cross-jurisdiction judgment corpus",
    },
    {
      icon: Scale,
      value: stats?.judgments ?? 0,
      label: "Court judgments",
      detail: `${formatStat(stats?.judgments_pl ?? 0)} Polish, ${formatStat(stats?.judgments_uk ?? 0)} UK`,
    },
    {
      icon: FileText,
      value: stats?.judgments_pl ?? 0,
      label: "Polish judgments",
      detail: "Appellate and court decision coverage",
    },
    {
      icon: BookOpen,
      value: stats?.judgments_uk ?? 0,
      label: "UK judgments",
      detail: "England & Wales coverage",
    },
    {
      icon: Globe,
      value: 2,
      label: "Jurisdictions",
      detail: "Poland and United Kingdom",
      noAnimate: true,
    },
  ];

  return (
    <Section className="bg-gradient-to-b from-primary/[0.02] to-background">
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-medium text-primary uppercase tracking-[0.1em] mb-3">
            Database
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.02em] text-foreground leading-tight mb-4">
            Comprehensive legal coverage
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Continuously updated database of court decisions from Polish and UK jurisdictions, processed and indexed for semantic retrieval.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {statItems.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="text-center p-8 rounded-2xl border border-border bg-card"
            >
              <div className="mx-auto mb-4 p-3 w-fit rounded-xl bg-primary/8">
                <item.icon className="size-5 text-primary" />
              </div>
              <div className="text-3xl sm:text-4xl font-semibold text-foreground tabular-nums mb-1">
                {statsLoading ? (
                  <span className="inline-block w-20 h-9 bg-muted/40 rounded animate-pulse" />
                ) : item.noAnimate ? (
                  item.value
                ) : (
                  <AnimatedStat value={item.value} suffix="+" />
                )}
              </div>
              <div className="text-sm font-medium text-foreground mb-1">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.detail}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K`;
  return n.toLocaleString();
}

// ─────────────────────────────────────────────
// Section: About the JuDDGES Project
// ─────────────────────────────────────────────

const projectHighlights = [
  {
    icon: Landmark,
    title: "Cross-Jurisdictional Research",
    description:
      "Covers criminal court records from Poland and England & Wales, enabling comparative analysis across diverse legal constitutions.",
  },
  {
    icon: FlaskConical,
    title: "NLP & Human-In-The-Loop",
    description:
      "Leverages advanced Natural Language Processing combined with human expertise to ensure accuracy in legal text annotation and analysis.",
  },
  {
    icon: Users,
    title: "Open Science Principles",
    description:
      "All software and tools are open source, fostering cross-disciplinary and cross-jurisdictional collaboration among researchers and public institutions.",
  },
  {
    icon: BookOpen,
    title: "Comprehensive Legal Repository",
    description:
      "Building the most comprehensive legal research repository in Europe, enabling flexible meta-annotation of legal texts at scale.",
  },
] as const;

function AboutProjectSection() {
  return (
    <Section className="bg-gradient-to-b from-background to-primary/[0.02]">
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        {/* Section header */}
        <div className="max-w-3xl mb-16">
          <p className="text-sm font-medium text-primary uppercase tracking-[0.1em] mb-3">
            About the Project
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.02em] text-foreground leading-tight mb-4">
            The JuDDGES Initiative
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            The JuDDGES project aims to revolutionize the accessibility and analysis of judicial decisions across varied legal systems. By overcoming barriers related to resources, language, data, and format inhomogeneity, the project facilitates the development and testing of theories on judicial decision-making and informs judicial policy and practice.
          </p>
        </div>

        {/* Highlight cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mb-16">
          {projectHighlights.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex gap-5 p-6 rounded-2xl border border-border bg-card transition-colors duration-200 hover:border-primary/20"
            >
              <div className="shrink-0 p-3 h-fit rounded-xl bg-primary/8">
                <item.icon className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground mb-2 tracking-[-0.01em]">
                  {item.title}
                </h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Project details bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border bg-card p-8 md:p-10"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-[0.1em] mb-2">
                Duration
              </p>
              <p className="text-lg font-semibold text-foreground">
                Jan 2024 &ndash; Jan 2026
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Two-year research programme
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-[0.1em] mb-2">
                Funding
              </p>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                &euro;529,384.67
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                European research grant
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-[0.1em] mb-2">
                Institution
              </p>
              <p className="text-lg font-semibold text-foreground">
                Wroclaw University
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                of Science and Technology
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 4: How It Works
// ─────────────────────────────────────────────

const steps = [
  {
    number: "01",
    title: "Search or ask",
    description:
      "Type a legal question or search query. The system understands natural language and legal terminology in both English and Polish.",
  },
  {
    number: "02",
    title: "Get relevant results",
    description:
      "AI retrieves the most relevant court judgments using semantic similarity, ranked by relevance with citations to specific decisions.",
  },
  {
    number: "03",
    title: "Analyze and extract",
    description:
      "Dig deeper with AI chat, save documents to collections, or define schemas to extract structured data from judgments at scale.",
  },
] as const;

function HowItWorksSection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        {/* Section header */}
        <div className="max-w-2xl mb-16">
          <p className="text-sm font-medium text-primary uppercase tracking-[0.1em] mb-3">
            How it works
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.02em] text-foreground leading-tight">
            From question to insight
            <br />
            in three steps
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              {/* Step number */}
              <div className="text-5xl font-light text-primary/20 mb-4 tabular-nums">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2 tracking-[-0.01em]">
                {step.title}
              </h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 5: Trust & CTA
// ─────────────────────────────────────────────

function TrustCTASection() {
  return (
    <Section className="border-t border-border">
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto text-center">
          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 mb-12 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Lock className="size-4" />
              <span>GDPR Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="size-4" />
              <span>EU Hosted</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="size-4" />
              <span>Open Source</span>
            </div>
          </div>

          {/* CTA */}
          <h2 className="font-serif text-3xl sm:text-4xl font-normal tracking-[-0.02em] text-foreground leading-tight mb-4">
            Start using JuDDGES for free
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed mb-8">
            No credit card required. JuDDGES is an academic research project
            at Wroclaw University of Science and Technology, open to researchers and institutions.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mb-8">
            <Button size="lg" asChild className="h-13 px-10 text-base group shadow-md hover:shadow-lg transition-shadow duration-200">
              <Link href="/search">
                Open search
                <ArrowRight className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-200 ease-out" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-13 px-10 text-base hover:shadow-md transition-shadow duration-200">
              <Link href="/auth/sign-up">Create free account</Link>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="size-4" />
            <span>JuDDGES &mdash; A research project by Wroclaw University of Science and Technology</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Main Landing Page
// ─────────────────────────────────────────────

export function LandingPage({ stats, statsLoading }: LandingPageProps) {
  return (
    <div className="min-h-screen">
      <HeroSection stats={stats} statsLoading={statsLoading} />
      <AboutProjectSection />
      <CapabilitiesSection />
      <DataAuthoritySection stats={stats} statsLoading={statsLoading} />
      <HowItWorksSection />
      <TrustCTASection />
    </div>
  );
}

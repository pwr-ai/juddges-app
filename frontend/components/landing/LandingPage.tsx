"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Search,
  Zap,
  GraduationCap,
  Landmark,
  BookOpen,
  Users,
  FlaskConical,
  Network,
  Github,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropCap,
  EditorialButton,
  EditorialCard,
  Eyebrow,
  Headline,
  Masthead,
  PaperBackground,
  QueryPill,
  Rule,
  SectionHeader,
  Stat,
} from "@/components/editorial";

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

// Demo queries — language is derived from the `lang` URL param in each href.
const demoQueries: ReadonlyArray<{
  label: string;
  href: string;
  lang: "PL" | "EN";
}> = [
  {
    label: "Frankowicze i abuzywne klauzule",
    href: "/search?q=frankowicze%20i%20abuzywne%20klauzule&lang=pl&mode=thinking&type=judgment",
    lang: "PL",
  },
  {
    label: "Murder conviction appeal",
    href: "/search?q=murder%20conviction%20appeal&lang=en&mode=thinking&type=judgment",
    lang: "EN",
  },
  {
    label: "Skarga do sądu administracyjnego",
    href: "/search?q=skarga%20do%20s%C4%85du%20administracyjnego&lang=pl&mode=thinking&type=judgment",
    lang: "PL",
  },
  {
    label: "Consumer protection in financial services",
    href: "/search?q=consumer%20protection%20in%20financial%20services&lang=en&mode=thinking&type=judgment",
    lang: "EN",
  },
];

// ─────────────────────────────────────────────
// Section wrapper with editorial fade-in
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
// Section 1: Hero — editorial nameplate
// ─────────────────────────────────────────────

function HeroSection({ stats, statsLoading }: LandingPageProps) {
  const totalJudgments = stats?.judgments ?? stats?.total_documents ?? 0;

  return (
    <section className="relative overflow-hidden">
      <div className="relative w-full max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12 pt-10 pb-20 md:pt-14 md:pb-28">
        {/* Masthead — periodical nameplate */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Masthead badge="EST. 2024 · WROCLAW" meta="VOL I · NO 1" ruled />
        </motion.div>

        <div className="max-w-3xl mt-12 md:mt-16">
          {/* Institution byline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mb-8"
          >
            <Eyebrow as="p" tone="default" noRule>
              <GraduationCap className="size-3.5" aria-hidden />
              Wroclaw University of Science and Technology
            </Eyebrow>
          </motion.div>

          {/* Hero headline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <Headline as="h1" size="lg">
              JuDDGES — <em>Judicial Decision</em> Data Gathering, Encoding &amp;{" "}
              <em>Sharing</em>
            </Headline>
          </motion.div>

          {/* Drop-cap subheadline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-2xl mb-10"
          >
            <DropCap>
              An open-source research platform for searching and analyzing
              court judgments from Poland and England &amp; Wales with
              AI-powered semantic search and structured data extraction.
            </DropCap>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-3 mb-14"
          >
            <EditorialButton href="/search" size="lg" arrow>
              Try search
            </EditorialButton>
            <EditorialButton
              href="/auth/sign-up"
              variant="secondary"
              size="lg"
            >
              Create free account
            </EditorialButton>
          </motion.div>

          {/* Demo queries */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-16"
          >
            <Eyebrow as="p" className="mb-5">
              Popular demo queries
            </Eyebrow>
            <div className="flex flex-wrap gap-3">
              {demoQueries.map((item) => (
                <QueryPill key={item.label} href={item.href} lang={item.lang}>
                  {item.label}
                </QueryPill>
              ))}
            </div>
          </motion.div>

          {/* Stat strip — separated by hairline rules */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <Rule weight="medium" className="mb-8" />
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--rule)]">
              <div className="pb-6 sm:pb-0 sm:pr-8">
                <Stat
                  value={totalJudgments}
                  suffix="+"
                  label="Judgments indexed"
                  marker="¹"
                  size="md"
                  loading={statsLoading}
                />
              </div>
              <div className="py-6 sm:py-0 sm:px-8">
                <Stat
                  value={2}
                  static
                  label="Jurisdictions"
                  detail="Poland · United Kingdom"
                  size="md"
                />
              </div>
              <div className="pt-6 sm:pt-0 sm:pl-8">
                <div className="flex flex-col gap-1.5">
                  <span className="editorial-numeral text-4xl sm:text-5xl lg:text-6xl leading-[0.95]">
                    Free
                  </span>
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
                    Academic access
                  </span>
                </div>
              </div>
            </div>
            <Rule weight="medium" className="mt-8" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Section 2: About the JuDDGES Project
// ─────────────────────────────────────────────

const projectHighlights: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
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
];

function AboutProjectSection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        {/* Section header */}
        <SectionHeader
          eyebrow="About the Project"
          numeral="01"
          title={
            <>
              The <em>JuDDGES</em> Initiative
            </>
          }
          description="The JuDDGES project aims to revolutionize the accessibility and analysis of judicial decisions across varied legal systems. By overcoming barriers related to resources, language, data, and format inhomogeneity, the project facilitates the development and testing of theories on judicial decision-making and informs judicial policy and practice."
          className="mb-16"
        />

        {/* Highlight cards — first one is featured */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[color:var(--rule)] mb-12">
          {projectHighlights.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-[color:var(--parchment)]"
              >
                <EditorialCard
                  featured={i === 0}
                  title={item.title}
                  flat
                  className="h-full border-0"
                >
                  <div className="flex gap-4">
                    <Icon
                      className="mt-1 size-5 shrink-0 text-[color:var(--ink-soft)]"
                      aria-hidden
                    />
                    <p className="text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
                      {item.description}
                    </p>
                  </div>
                </EditorialCard>
              </motion.div>
            );
          })}
        </div>

        {/* Project details bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          <Rule weight="ink" />
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--rule)]">
            <div className="py-8 sm:py-10 sm:pr-8">
              <Eyebrow as="p" tone="oxblood" className="mb-3">
                Duration
              </Eyebrow>
              <p className="font-serif text-2xl sm:text-3xl leading-[1.1] text-[color:var(--ink)]">
                Jan 2024 &ndash; Jan 2026
              </p>
              <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                Two-year research programme
              </p>
            </div>
            <div className="py-8 sm:py-10 sm:px-8">
              <Eyebrow as="p" tone="oxblood" className="mb-3">
                Funding
              </Eyebrow>
              <p className="editorial-numeral font-serif text-2xl sm:text-3xl leading-[1.1] text-[color:var(--ink)]">
                &euro;529,384.67
              </p>
              <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                European research grant
              </p>
            </div>
            <div className="py-8 sm:py-10 sm:pl-8">
              <Eyebrow as="p" tone="oxblood" className="mb-3">
                Institution
              </Eyebrow>
              <p className="font-serif text-2xl sm:text-3xl leading-[1.1] text-[color:var(--ink)]">
                Wroclaw University
              </p>
              <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
                of Science and Technology
              </p>
            </div>
          </div>
          <Rule weight="ink" />
        </motion.div>

        {/* Ecosystem callout */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-12"
        >
          <EditorialCard
            featured
            eyebrow="Ecosystem"
            title="Part of an open-source research ecosystem"
            action={
              <EditorialButton href="/ecosystem" variant="ghost" arrow>
                Explore the ecosystem
              </EditorialButton>
            }
          >
            <div className="flex gap-4">
              <Network
                className="mt-1 size-5 shrink-0 text-[color:var(--ink-soft)]"
                aria-hidden
              />
              <p className="text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
                This platform works alongside a dedicated human-in-the-loop
                annotation workbench and the parent JuDDGES research
                repository, maintained across collaborating teams. Together
                they form an end-to-end open pipeline from raw judgment text to
                verified research data.
              </p>
            </div>
            <Rule weight="hairline" className="mt-6" />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
              <span className="inline-flex items-center gap-1.5">
                <Github className="size-3.5" aria-hidden /> pwr-ai/JuDDGES
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Github className="size-3.5" aria-hidden /> tsantosh7/hitl-tool
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Github className="size-3.5" aria-hidden /> pwr-ai/juddges-app
              </span>
            </div>
          </EditorialCard>
        </motion.div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 3: Capabilities Showcase
// ─────────────────────────────────────────────

const capabilities: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  description: string;
  features: ReadonlyArray<string>;
  href: string;
  cta: string;
}> = [
  {
    icon: Search,
    title: "Semantic Search",
    description:
      "Find relevant cases by meaning, not just keywords. Our AI understands legal concepts and retrieves judgments based on semantic similarity across millions of documents.",
    features: [
      "Full-text & vector search",
      "Cross-jurisdiction results",
      "Advanced filters by court, date, topic",
    ],
    href: "/search",
    cta: "Try search",
  },
  {
    icon: MessageSquare,
    title: "AI Legal Assistant",
    description:
      "Ask questions in natural language and get answers grounded in actual court decisions. Every response includes citations to specific judgments.",
    features: [
      "Citation-backed answers",
      "Multi-turn conversations",
      "Case law reasoning",
    ],
    href: "/chat",
    cta: "Start a conversation",
  },
  {
    icon: Zap,
    title: "Schema Extraction",
    description:
      "Define custom data schemas and let AI agents extract structured information from legal documents at scale. Build datasets from raw judgments.",
    features: [
      "Custom field definitions",
      "Batch processing",
      "Export structured data",
    ],
    href: "/schema-chat",
    cta: "Create a schema",
  },
];

function CapabilitiesSection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        <SectionHeader
          eyebrow="Capabilities"
          numeral="02"
          title={
            <>
              Three ways to <em>work</em> with legal data
            </>
          }
          description="Search, analyze, and extract structured information from court judgments across jurisdictions."
          className="mb-16"
        />

        {/* Capability cards — first is featured */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[color:var(--rule)]">
          {capabilities.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-[color:var(--parchment)]"
              >
                <EditorialCard
                  featured={i === 0}
                  eyebrow={`Capability ${String(i + 1).padStart(2, "0")}`}
                  title={cap.title}
                  flat
                  className="h-full border-0"
                >
                  <div className="flex items-start gap-3 mb-5">
                    <Icon
                      className="mt-1 size-5 shrink-0 text-[color:var(--ink-soft)]"
                      aria-hidden
                    />
                    <p className="text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
                      {cap.description}
                    </p>
                  </div>

                  <ul className="flex-1 mb-6">
                    {cap.features.map((f) => (
                      <li
                        key={f}
                        className="border-t border-[color:var(--rule)] py-2.5 text-sm text-[color:var(--ink)]"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto">
                    <EditorialButton
                      href={cap.href}
                      variant="ghost"
                      size="sm"
                      arrow
                      className="px-0"
                    >
                      {cap.cta}
                    </EditorialButton>
                  </div>
                </EditorialCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 4: Data Authority
// ─────────────────────────────────────────────

function DataAuthoritySection({ stats, statsLoading }: LandingPageProps) {
  const totalJudgments = stats?.judgments ?? stats?.total_documents ?? 0;

  const statItems: ReadonlyArray<{
    value: number;
    label: string;
    detail: string;
    static?: boolean;
    suffix?: string;
    marker?: string;
  }> = [
    {
      value: totalJudgments,
      label: "Total judgments",
      detail: "Cross-jurisdiction judgment corpus",
      suffix: "+",
      marker: "¹",
    },
    {
      value: stats?.judgments ?? 0,
      label: "Court judgments",
      detail: `${formatStat(stats?.judgments_pl ?? 0)} Polish, ${formatStat(stats?.judgments_uk ?? 0)} UK`,
      suffix: "+",
    },
    {
      value: stats?.judgments_pl ?? 0,
      label: "Polish judgments",
      detail: "Appellate and court decision coverage",
      suffix: "+",
    },
    {
      value: stats?.judgments_uk ?? 0,
      label: "UK judgments",
      detail: "England & Wales coverage",
      suffix: "+",
    },
    {
      value: 2,
      label: "Jurisdictions",
      detail: "Poland and United Kingdom",
      static: true,
    },
  ];

  return (
    <Section>
      <PaperBackground deep className="py-20 md:py-28 -my-20 md:-my-28">
        <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
          <SectionHeader
            eyebrow="Database"
            numeral="03"
            title={
              <>
                Comprehensive <em>legal coverage</em>
              </>
            }
            description="Continuously updated database of court decisions from Polish and UK jurisdictions, processed and indexed for semantic retrieval."
            className="mb-16"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-[color:var(--rule)]">
            {statItems.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-[color:var(--parchment-deep)] p-6 sm:p-7"
              >
                <Stat
                  value={item.value}
                  suffix={item.suffix}
                  label={item.label}
                  detail={item.detail}
                  static={item.static}
                  loading={statsLoading}
                  marker={item.marker}
                  size="sm"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </PaperBackground>
    </Section>
  );
}

function formatStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K`;
  return n.toLocaleString();
}

// ─────────────────────────────────────────────
// Section 5: How It Works
// ─────────────────────────────────────────────

const steps: ReadonlyArray<{
  number: string;
  title: string;
  description: string;
}> = [
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
];

function HowItWorksSection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        <SectionHeader
          eyebrow="How it works"
          numeral="04"
          title={
            <>
              From <em>question</em> to insight in three steps
            </>
          }
          className="mb-16"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[color:var(--rule)]">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-[color:var(--parchment)] p-8 lg:p-10"
            >
              <div className="flex items-start gap-5">
                {/* Marginalia numeral */}
                <span
                  aria-hidden
                  className="text-7xl font-serif italic text-[color:var(--oxblood)]/30 leading-[0.85] tabular-nums select-none"
                >
                  {step.number}
                </span>
                <div className="flex-1 pt-2">
                  <Headline as="h3" size="xs" className="mb-3">
                    {step.title}
                  </Headline>
                  <p className="text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">
                    {step.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────
// Section 6: Trust & CTA
// ─────────────────────────────────────────────

function TrustCTASection() {
  return (
    <Section>
      <div className="max-w-[75rem] mx-auto px-6 md:px-8 lg:px-12">
        <Rule weight="ink" className="mb-16" />
        <div className="max-w-2xl mx-auto text-center">
          {/* Trust badges — inline mono-caps separated by middle dots */}
          <p className="mb-12 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            <span>GDPR Compliant</span>
            <span aria-hidden className="mx-3 text-[color:var(--rule-strong)]">
              ·
            </span>
            <span>EU Hosted</span>
            <span aria-hidden className="mx-3 text-[color:var(--rule-strong)]">
              ·
            </span>
            <span>Open Source</span>
          </p>

          <Headline as="h2" size="md" className="mb-6">
            Start using <em>JuDDGES</em> for free
          </Headline>
          <p className="text-[17px] leading-[1.65] text-[color:var(--ink-soft)] mb-10">
            No credit card required. JuDDGES is an academic research project at
            Wroclaw University of Science and Technology, open to researchers
            and institutions.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-10">
            <EditorialButton href="/search" size="lg" arrow>
              Open search
            </EditorialButton>
            <EditorialButton
              href="/auth/sign-up"
              variant="secondary"
              size="lg"
            >
              Create free account
            </EditorialButton>
          </div>

          <Rule weight="hairline" className="mb-6" />
          <p className="inline-flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
            <GraduationCap className="size-3.5" aria-hidden />
            <span>
              JuDDGES &mdash; A research project by Wroclaw University of
              Science and Technology
            </span>
          </p>
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
    <PaperBackground grain className="min-h-screen">
      <HeroSection stats={stats} statsLoading={statsLoading} />
      <AboutProjectSection />
      <CapabilitiesSection />
      <DataAuthoritySection stats={stats} statsLoading={statsLoading} />
      <HowItWorksSection />
      <TrustCTASection />
    </PaperBackground>
  );
}

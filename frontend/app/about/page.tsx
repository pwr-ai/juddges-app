"use client";

import {
  Mail,
  BookOpen,
  Users,
  Globe,
  Target,
  GraduationCap,
  ArrowRight,
  Network,
} from "lucide-react";
import { GithubIcon } from "@/components/icons/brand";
import { VariantButton, PageContainer, Badge } from "@/lib/styles/components";
import { EditorialCard, Eyebrow, Headline, Rule, Stat } from "@/components/editorial";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

const ICON = "size-5 shrink-0 text-[color:var(--oxblood)]";
const BULLET = "mt-[0.45em] size-1.5 shrink-0 bg-[color:var(--oxblood)]";
const REPO_LINK =
  "inline-flex items-center gap-1 text-sm text-[color:var(--oxblood)] underline-offset-4 hover:underline";

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  lede,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  lede?: string;
}): React.JSX.Element {
  return (
    <header className="mb-6">
      <Eyebrow as="p" tone="oxblood" className="mb-3">
        {eyebrow}
      </Eyebrow>
      <div className="flex items-center gap-3">
        {Icon && <Icon className={ICON} />}
        <Headline as="h2" size="sm">
          {title}
        </Headline>
      </div>
      {lede && (
        <p className="mt-2 text-base text-[color:var(--ink-soft)]">{lede}</p>
      )}
    </header>
  );
}

export default function AboutPage(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero Section */}
      <header className="mb-16">
        <Eyebrow as="p" tone="oxblood" className="mb-3">
          Research & Innovation
        </Eyebrow>
        <Headline as="h1" size="md">
          About JuDDGES
        </Headline>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[color:var(--ink-soft)]">
          Advancing legal research through artificial intelligence and open science
        </p>
      </header>

      {/* University Section */}
      <EditorialCard className="mb-10">
        <SectionTitle
          icon={GraduationCap}
          eyebrow="Home institution"
          title="Wrocław University of Science and Technology"
        />
        <div className="space-y-6">
          <p className="text-base leading-relaxed">
            Wrocław University of Science and Technology (Polish: Politechnika Wrocławska)
            is a leading technological university in Wrocław, Poland. Founded in 1945,
            the university is recognized for its research and engineering education.
            Named by Huffington Post UK in the top 15 of the World&apos;s Most Beautiful
            Universities Rankings, its main campus is located near Plac Grunwaldzki
            alongside the Oder river.
          </p>
          <p className="text-base leading-relaxed">
            The university ranks among the best in the world according to the Shanghai
            Ranking (ARWU 2021: 901-1000 band) and holds 3rd place among Polish technical
            universities. With over 26,000 students and more than 4,000 academic staff,
            it operates 14 faculties across engineering, sciences, medicine, and social
            sciences. This platform is developed by the Department of Artificial Intelligence
            at WUST, which conducts research in AI, machine learning, natural language
            processing, and legal informatics, contributing to both academic advancement
            and real-world applications.
          </p>

          <Rule spaced />
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <Stat static size="sm" value="1945" label="Founded" detail="University established" />
            <Stat static size="sm" value="26,000" suffix="+" label="Student body" detail="Students" />
            <Stat static size="sm" value="Top 3" label="National ranking" detail="Polish tech universities" />
            <Stat static size="sm" value={14} label="Academic units" detail="Faculties" />
          </div>

          {/* Additional Rankings */}
          <EditorialCard flat eyebrow="Rankings" title="International Recognition">
            <ul className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span>QS World University Rankings: 7 scientific fields classified</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span>Material Sciences: Top 301-350 globally</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span>Mathematics: Top 201-300 globally (ARWU)</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span>Regional Ranking Europe & Central Asia: 43rd place</span>
              </li>
            </ul>
          </EditorialCard>
        </div>
      </EditorialCard>

      {/* Juddges Platform */}
      <EditorialCard className="mb-10">
        <SectionTitle
          icon={Target}
          eyebrow="Platform"
          title="JuDDGES Platform"
          lede="Judicial Decision Data Gathering, Encoding, and Sharing"
        />
        <div className="space-y-8">
          <div>
            <p className="mb-5 text-base leading-relaxed">
              JuDDGES is a platform for the analysis of legal documents, particularly
              court judgments and legal decisions. Our goal is to use artificial
              intelligence to:
            </p>
            <ul className="mb-5 space-y-3">
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span className="text-base">Automate the analysis of complex legal documents</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span className="text-base">Extract relevant information from court judgments</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span className="text-base">Provide insights into judicial reasoning and case law trends</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span className="text-base">Support legal professionals in their research and analysis</span>
              </li>
              <li className="flex items-start gap-3">
                <span aria-hidden className={BULLET} />
                <span className="text-base">Improve accessibility to legal information</span>
              </li>
            </ul>
            <p className="text-base leading-relaxed">
              Through natural language processing and machine learning techniques, we
              aim to make legal document analysis more efficient and accessible to both
              legal professionals and the general public.
            </p>
          </div>

          <div>
            <Headline as="h3" size="xs" className="mb-4">
              Technologies & Methods
            </Headline>
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="px-3 py-1.5">Large Language Models</Badge>
              <Badge variant="secondary" className="px-3 py-1.5">Vector Databases</Badge>
              <Badge variant="secondary" className="px-3 py-1.5">Information Extraction</Badge>
              <Badge variant="secondary" className="px-3 py-1.5">Semantic Search</Badge>
              <Badge variant="secondary" className="px-3 py-1.5">RAG (Retrieval-Augmented Generation)</Badge>
              <Badge variant="secondary" className="px-3 py-1.5">Natural Language Processing</Badge>
            </div>
          </div>
        </div>
      </EditorialCard>

      {/* JuDDGES Project */}
      <EditorialCard className="mb-10">
        <SectionTitle
          icon={Globe}
          eyebrow="Research project"
          title="JuDDGES Project"
          lede="Judicial Decision-making Data Generation and Evaluation System"
        />
        <div className="space-y-8">
          <p className="text-base leading-relaxed">
            The JuDDGES project applies Natural Language Processing (NLP) and
            Human-In-The-Loop (HITL) methods to change how legal researchers access,
            annotate, and analyze judicial decisions across various jurisdictions.
            Our team is committed to dissolving barriers in legal research, fostering
            open science, and enhancing the empirical study of judicial decision-making.
          </p>
          <p className="text-base leading-relaxed">
            JuDDGES aims to develop open software and tools for the
            extensive and flexible meta-annotation of legal records from
            criminal courts in jurisdictions with diverse legal systems,
            starting with Poland and England & Wales. This initiative is
            designed to support the development and empirical testing of
            theories in judicial decision-making, facilitating a deeper
            understanding of judicial policies and practices.
          </p>

          <div>
            <Headline as="h3" size="xs" className="mb-5">
              Key Goals
            </Headline>
            <div className="space-y-5">
              <EditorialCard flat>
                <div className="flex items-start gap-4">
                  <Users className={ICON} />
                  <div>
                    <div className="mb-1.5 font-semibold">Equip Researchers</div>
                    <div className="text-sm leading-relaxed text-[color:var(--ink-soft)]">
                      Providing researchers with tools for in-depth analysis of judicial decisions
                    </div>
                  </div>
                </div>
              </EditorialCard>
              <EditorialCard flat>
                <div className="flex items-start gap-4">
                  <BookOpen className={ICON} />
                  <div>
                    <div className="mb-1.5 font-semibold">Foster Open Science</div>
                    <div className="text-sm leading-relaxed text-[color:var(--ink-soft)]">
                      Making software tools and annotated datasets publicly available for research and educational purposes
                    </div>
                  </div>
                </div>
              </EditorialCard>
              <EditorialCard flat>
                <div className="flex items-start gap-4">
                  <Target className={ICON} />
                  <div>
                    <div className="mb-1.5 font-semibold">Enhance Legal Research</div>
                    <div className="text-sm leading-relaxed text-[color:var(--ink-soft)]">
                      Enabling empirical testing of judicial decision-making theories and practices
                    </div>
                  </div>
                </div>
              </EditorialCard>
            </div>
          </div>

          <div>
            <Headline as="h3" size="xs" className="mb-4">
              Jurisdictions Covered
            </Headline>
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className="gap-2 px-4 py-2">
                <span className="font-mono text-xs uppercase tracking-wider">PL</span> Poland
              </Badge>
              <Badge variant="outline" className="gap-2 px-4 py-2">
                <span className="font-mono text-xs uppercase tracking-wider">E&amp;W</span> England & Wales
              </Badge>
            </div>
          </div>
        </div>
      </EditorialCard>

      {/* Project Ecosystem */}
      <EditorialCard className="mb-10">
        <SectionTitle
          icon={Network}
          eyebrow="Ecosystem"
          title="Open Source Ecosystem"
          lede="JuDDGES is built as a federation of focused open-source tools, not a single monolithic app"
        />
        <div className="space-y-5">
          <p className="text-base leading-relaxed">
            This platform is one of several independently maintained projects that together form
            the JuDDGES research pipeline. The parent research project hosts datasets, NLP pipelines,
            and HITL experiments. A dedicated annotation workbench, maintained by partner contributors,
            produces the verified ground-truth annotations that downstream tools — including this
            platform — consume.
          </p>
          <p className="text-base leading-relaxed">
            Keeping the projects separate but linked through shared open data formats lets each
            team iterate on their own cadence while still contributing to a coherent whole.
          </p>

          <div className="grid grid-cols-1 gap-5 pt-2 md:grid-cols-3">
            <EditorialCard flat>
              <div className="mb-2 flex items-start gap-3">
                <BookOpen className={ICON} />
                <div className="font-semibold">JuDDGES (research)</div>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                Parent research project: datasets, NLP pipelines, model training.
              </p>
              <a
                href="https://github.com/pwr-ai/JuDDGES"
                target="_blank"
                rel="noopener noreferrer"
                className={REPO_LINK}
              >
                <GithubIcon className="size-3.5" /> pwr-ai/JuDDGES
              </a>
            </EditorialCard>

            <EditorialCard flat>
              <div className="mb-2 flex items-start gap-3">
                <Users className={ICON} />
                <div className="font-semibold">HITL Annotation Tool</div>
              </div>
              <p className="mb-1.5 text-xs text-[color:var(--ink-soft)]">Middlesex University, London</p>
              <p className="mb-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                Upstream human-in-the-loop workbench for verifying LLM extractions.
              </p>
              <a
                href="https://github.com/tsantosh7/hitl-tool"
                target="_blank"
                rel="noopener noreferrer"
                className={REPO_LINK}
              >
                <GithubIcon className="size-3.5" /> tsantosh7/hitl-tool
              </a>
            </EditorialCard>

            <EditorialCard flat>
              <div className="mb-2 flex items-start gap-3">
                <Target className={ICON} />
                <div className="font-semibold">JuDDGES App</div>
              </div>
              <p className="mb-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">
                This platform — search and structured extraction.
              </p>
              <a
                href="https://github.com/pwr-ai/juddges-app"
                target="_blank"
                rel="noopener noreferrer"
                className={REPO_LINK}
              >
                <GithubIcon className="size-3.5" /> pwr-ai/juddges-app
              </a>
            </EditorialCard>
          </div>

          <div className="pt-2">
            <VariantButton intent="primary"
              icon={ArrowRight}
              onClick={() => router.push("/ecosystem")}
            >
              Explore the full ecosystem
            </VariantButton>
          </div>
        </div>
      </EditorialCard>

      {/* Impact Section */}
      <section className="mb-10">
        <SectionTitle
          eyebrow="Impact"
          title="Our Impact"
          lede="Contributing to judgments analysis research and practice"
        />
        <Rule weight="ink" />
        <div className="grid grid-cols-2 gap-8 pt-6 md:grid-cols-4">
          <Stat static size="sm" value="3M" suffix="+" label="Documents processed" detail="Legal documents" />
          <Stat static size="sm" value={50} suffix="+" label="Research community" detail="Researchers served" />
          <Stat static size="sm" value={5} suffix="+" label="Academic output" detail="Publications" />
          <Stat static size="sm" value={3} label="Global reach" detail="Countries" />
        </div>
      </section>

      {/* Contact Section */}
      <EditorialCard className="mb-10">
        <SectionTitle
          eyebrow="Contact"
          title="Collaborate With Us"
          lede="Get in touch for research inquiries, collaborations, or technical questions"
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <VariantButton intent="secondary"
            className="h-auto py-6"
            onClick={() => window.location.href = 'mailto:lukasz.augustyniak@pwr.edu.pl'}
          >
            <div className="flex flex-col items-center gap-3">
              <Mail className="size-6" />
              <div className="text-center">
                <div className="mb-1 font-semibold">Research Inquiries</div>
                <div className="text-xs text-[color:var(--ink-soft)]">Email the team</div>
              </div>
            </div>
          </VariantButton>

          <VariantButton intent="secondary"
            className="h-auto py-6"
            onClick={() => window.open('https://github.com/pwr-ai/juddges-app', '_blank')}
          >
            <div className="flex flex-col items-center gap-3">
              <GithubIcon className="size-6" />
              <div className="text-center">
                <div className="mb-1 font-semibold">Open Source</div>
                <div className="text-xs text-[color:var(--ink-soft)]">View on GitHub</div>
              </div>
            </div>
          </VariantButton>

          <VariantButton intent="secondary"
            className="h-auto py-6"
            onClick={() => router.push('/use-cases')}
          >
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="size-6" />
              <div className="text-center">
                <div className="mb-1 font-semibold">Use Cases</div>
                <div className="text-xs text-[color:var(--ink-soft)]">See examples</div>
              </div>
            </div>
          </VariantButton>
        </div>
      </EditorialCard>

      {/* CTA */}
      <section className="py-12 text-center">
        <Headline as="h2" size="sm" className="mb-6">
          Ready to explore?
        </Headline>
        <p className="mb-8 text-lg text-[color:var(--ink-soft)]">
          Start using JuDDGES for legal research
        </p>
        {user ? (
          <VariantButton intent="primary" size="lg" icon={ArrowRight} onClick={() => router.push('/')}>
            Go to Dashboard
          </VariantButton>
        ) : (
          <div className="flex justify-center gap-4">
            <VariantButton intent="primary" size="lg" icon={ArrowRight} onClick={() => router.push('/auth/sign-up')}>
              Get Started
            </VariantButton>
            <VariantButton intent="secondary" size="lg" onClick={() => router.push('/auth/login')}>
              Sign In
            </VariantButton>
          </div>
        )}
      </section>
    </PageContainer>
  );
}

"use client";

import {
  Mail,
  Github,
  BookOpen,
  Users,
  Globe,
  Target,
  GraduationCap,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  Header,
  SectionHeader,
  SecondaryHeader,
  LightCard,
  PrimaryButton,
  SecondaryButton,
  PageContainer,
  Badge,
} from "@/lib/styles/components";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { gradients } from "@/lib/styles/colors/gradients";

export default function AboutPage(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero Section */}
      <div className="mb-16">
        <Badge variant="outline" className="mb-6">
          Research & Innovation
        </Badge>
        <Header
          icon={Sparkles}
          title="About JuDDGES"
          size="4xl"
          description="Advancing legal research through artificial intelligence and open science"
        />
      </div>

      {/* University Section */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={GraduationCap}
          title="Wrocław University of Science and Technology"
          className="mb-6"
        />
        <div className="space-y-6">
          <p className="text-base leading-relaxed">
            Wrocław University of Science and Technology (Polish: Politechnika Wrocławska)
            is a leading technological university in Wrocław, Poland. Founded in 1945,
            the university has evolved into a world-class institution recognized for its
            excellence in research and innovation. Named by Huffington Post UK in the
            top 15 of the World&apos;s Most Beautiful Universities Rankings, its main campus
            is located near Plac Grunwaldzki alongside the Oder river.
          </p>
          <p className="text-base leading-relaxed">
            The university ranks among the best in the world according to the Shanghai
            Ranking (ARWU 2021: 901-1000 band) and holds 3rd place among Polish technical
            universities. With over 26,000 students and more than 4,000 academic staff,
            it operates 14 faculties across engineering, sciences, medicine, and social
            sciences. This platform is developed by the Department of Artificial Intelligence
            at WUST, which is renowned for its cutting-edge research in AI, machine learning,
            natural language processing, and legal informatics, contributing significantly to
            both academic advancement and real-world applications.
          </p>

          {/* Stats - Reusing dashboard stat card style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pt-6">
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
              <div className="space-y-0.5 mb-2">
                <div className="text-sm font-semibold text-primary/80">Founded</div>
                <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                  1945
                </div>
              </div>
              <div className="text-base font-medium text-muted-foreground">University Established</div>
            </div>
            
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
              <div className="space-y-0.5 mb-2">
                <div className="text-sm font-semibold text-primary/80">Student Body</div>
                <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                  26,000+
                </div>
              </div>
              <div className="text-base font-medium text-muted-foreground">Students</div>
            </div>
            
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
              <div className="space-y-0.5 mb-2">
                <div className="text-sm font-semibold text-primary/80">National Ranking</div>
                <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                  Top 3
                </div>
              </div>
              <div className="text-base font-medium text-muted-foreground">Polish Tech Universities</div>
            </div>
            
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
              <div className="space-y-0.5 mb-2">
                <div className="text-sm font-semibold text-primary/80">Academic Units</div>
                <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                  14
                </div>
              </div>
              <div className="text-base font-medium text-muted-foreground">Faculties</div>
            </div>
          </div>

          {/* Additional Rankings */}
          <div className="mt-6">
            <SectionHeader title="International Recognition" className="mb-4" />
            <LightCard padding="md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>QS World University Rankings: 7 scientific fields classified</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Material Sciences: Top 301-350 globally</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Mathematics: Top 201-300 globally (ARWU)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>Regional Ranking Europe & Central Asia: 43rd place</span>
                </div>
              </div>
            </LightCard>
          </div>
        </div>
      </LightCard>

      {/* Juddges Platform */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Target}
          title="JuDDGES Platform"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">Judicial Decision Data Gathering, Encoding, and Sharing</p>
        <div className="space-y-8">
          <div>
            <p className="mb-5 text-base leading-relaxed">
              JuDDGES is an innovative platform focused on the analysis of
              legal documents, particularly court judgments and legal
              decisions. Our goal is to leverage artificial
              intelligence to:
            </p>
            <ul className="space-y-3 mb-5">
              <li className="flex items-start gap-3">
                <span className="text-primary mt-1 text-lg">•</span>
                <span className="text-base">Automate the analysis of complex legal documents</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary mt-1 text-lg">•</span>
                <span className="text-base">Extract relevant information from court judgments</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary mt-1 text-lg">•</span>
                <span className="text-base">Provide insights into tax law interpretations</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary mt-1 text-lg">•</span>
                <span className="text-base">Support legal professionals in their research and analysis</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary mt-1 text-lg">•</span>
                <span className="text-base">Improve accessibility to legal information</span>
              </li>
            </ul>
            <p className="text-base leading-relaxed">
              Through advanced natural language processing and machine
              learning techniques, we aim to make legal document analysis
              more efficient and accessible to both legal professionals
              and the general public.
            </p>
          </div>

          <div>
            <SectionHeader
              title="Technologies & Methods"
              className="mb-4"
            />
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
      </LightCard>

      {/* JuDDGES Project */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Globe}
          title="JuDDGES Project"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">Judicial Decision-making Data Generation and Evaluation System</p>
        <div className="space-y-8">
          <p className="text-base leading-relaxed">
            The JuDDGES project harnesses state-of-the-art technologies
            in Natural Language Processing (NLP) and Human-In-The-Loop
            (HITL) to revolutionize how legal researchers access,
            annotate, and analyze judicial decisions across various
            jurisdictions. Our team is committed to dissolving barriers
            in legal research, fostering open science, and enhancing the
            empirical study of judicial decision-making.
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
            <SectionHeader title="Key Goals" className="mb-5" />
            <div className="space-y-5">
              <LightCard padding="md">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Users className="size-6" />
                  </div>
                  <div>
                    <div className="font-semibold mb-1.5">Empower Researchers</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      Providing researchers with tools for in-depth analysis of judicial decisions
                    </div>
                  </div>
                </div>
              </LightCard>
              <LightCard padding="md">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <BookOpen className="size-6" />
                  </div>
                  <div>
                    <div className="font-semibold mb-1.5">Foster Open Science</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      Making software tools and annotated datasets publicly available for research and educational purposes
                    </div>
                  </div>
                </div>
              </LightCard>
              <LightCard padding="md">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Target className="size-6" />
                  </div>
                  <div>
                    <div className="font-semibold mb-1.5">Enhance Legal Research</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      Enabling empirical testing of judicial decision-making theories and practices
                    </div>
                  </div>
                </div>
              </LightCard>
            </div>
          </div>

          <div>
            <SectionHeader title="Jurisdictions Covered" className="mb-4" />
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className="gap-2 px-4 py-2">
                <span className="text-lg">🇵🇱</span> Poland
              </Badge>
              <Badge variant="outline" className="gap-2 px-4 py-2">
                <span className="text-lg">🇬🇧</span> England & Wales
              </Badge>
            </div>
          </div>
        </div>
      </LightCard>

      {/* Impact Section */}
      <div className="mb-10">
        <SecondaryHeader
          title="Our Impact"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">Contributing to judgments analysis research and practice</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {/* Reusing dashboard stat card style */}
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
            <div className="space-y-0.5 mb-2">
              <div className="text-sm font-semibold text-primary/80">Documents Processed</div>
              <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                3M+
              </div>
            </div>
            <div className="text-base font-medium text-muted-foreground">Legal Documents</div>
          </div>
          
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
            <div className="space-y-0.5 mb-2">
              <div className="text-sm font-semibold text-primary/80">Research Community</div>
              <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                50+
              </div>
            </div>
            <div className="text-base font-medium text-muted-foreground">Researchers Served</div>
          </div>
          
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
            <div className="space-y-0.5 mb-2">
              <div className="text-sm font-semibold text-primary/80">Academic Output</div>
              <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                5+
              </div>
            </div>
            <div className="text-base font-medium text-muted-foreground">Publications</div>
          </div>
          
          <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 dark:from-muted/30 dark:to-muted/10 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
            <div className="space-y-0.5 mb-2">
              <div className="text-sm font-semibold text-primary/80">Global Reach</div>
              <div className={cn("text-5xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent", gradients.header.hover)}>
                3
              </div>
            </div>
            <div className="text-base font-medium text-muted-foreground">Countries</div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          title="Collaborate With Us"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">Get in touch for research inquiries, collaborations, or technical questions</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <SecondaryButton 
            className="h-auto py-6" 
            onClick={() => window.location.href = 'mailto:lukasz.augustyniak@pwr.edu.pl'}
          >
            <div className="flex flex-col items-center gap-3">
              <Mail className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">Research Inquiries</div>
                <div className="text-xs text-muted-foreground">Email the team</div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton 
            className="h-auto py-6" 
            onClick={() => window.open('https://github.com/laugustyniak/legal-ai', '_blank')}
          >
            <div className="flex flex-col items-center gap-3">
              <Github className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">Open Source</div>
                <div className="text-xs text-muted-foreground">View on GitHub</div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton 
            className="h-auto py-6" 
            onClick={() => router.push('/use-cases')}
          >
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">Use Cases</div>
                <div className="text-xs text-muted-foreground">See examples</div>
              </div>
            </div>
          </SecondaryButton>
        </div>
      </LightCard>

      {/* CTA */}
      <div className="text-center py-12">
        <h2 className="text-3xl font-bold mb-6">Ready to explore?</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          Start using JuDDGES for AI-powered legal research
        </p>
        {user ? (
          <PrimaryButton size="lg" icon={ArrowRight} onClick={() => router.push('/')}>
            Go to Dashboard
          </PrimaryButton>
        ) : (
          <div className="flex gap-4 justify-center">
            <PrimaryButton size="lg" icon={ArrowRight} onClick={() => router.push('/auth/sign-up')}>
              Get Started
            </PrimaryButton>
            <SecondaryButton size="lg" onClick={() => router.push('/auth/login')}>
              Sign In
            </SecondaryButton>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

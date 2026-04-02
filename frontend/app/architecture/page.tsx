"use client";

import {
  Server,
  Database,
  Search,
  MessageSquare,
  ArrowRight,
  Layers,
  Shield,
  Zap,
  Globe,
  Brain,
  HardDrive,
  Network,
  MonitorSmartphone,
  Workflow,
  Container,
} from "lucide-react";
import {
  Header,
  SectionHeader,
  SecondaryHeader,
  LightCard,
  PrimaryButton,
  PageContainer,
  Badge,
} from "@/lib/styles/components";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { gradients } from "@/lib/styles/colors/gradients";
import Image from "next/image";

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 p-6 hover:bg-gradient-to-br hover:from-muted/60 hover:to-muted/30 hover:shadow-lg transition-all duration-500">
      <div className="space-y-0.5 mb-2">
        <div className="text-sm font-semibold text-primary/80">{label}</div>
        <div
          className={cn(
            "text-4xl font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent",
            gradients.header.hover
          )}
        >
          {value}
        </div>
      </div>
      <div className="text-base font-medium text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

function FlowStep({
  step,
  title,
  description,
  icon: Icon,
  isLast = false,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ElementType;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
          {step}
        </div>
        {!isLast && (
          <div className="w-0.5 h-full min-h-8 bg-primary/10 mt-2" />
        )}
      </div>
      <div className="pb-6">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="size-4 text-primary" />
          <span className="font-semibold">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function TechBadge({
  name,
  category,
}: {
  name: string;
  category: "frontend" | "backend" | "database" | "ai" | "infra";
}) {
  const colors = {
    frontend: "bg-blue-500/10 text-blue-700 border-blue-200",
    backend: "bg-green-500/10 text-green-700 border-green-200",
    database: "bg-purple-500/10 text-purple-700 border-purple-200",
    ai: "bg-amber-500/10 text-amber-700 border-amber-200",
    infra: "bg-rose-500/10 text-rose-700 border-rose-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border",
        colors[category]
      )}
    >
      {name}
    </span>
  );
}

export default function ArchitecturePage(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero Section */}
      <div className="mb-16">
        <Badge variant="outline" className="mb-6">
          System Architecture
        </Badge>
        <Header
          icon={Layers}
          title="Architecture Overview"
          size="4xl"
          description="How JuDDGES combines modern AI, vector search, and full-stack engineering to power legal research"
        />
      </div>

      {/* Tech Stack Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-12">
        <StatCard label="Frontend" value="Next.js 15" description="React 19 + App Router" />
        <StatCard label="Backend" value="FastAPI" description="Python 3.12 + LangChain" />
        <StatCard label="Vector DB" value="pgvector" description="768-dim HNSW index" />
        <StatCard label="Search" value="Hybrid" description="BM25 + Semantic + RRF" />
      </div>

      {/* System Architecture Diagram */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Network}
          title="System Architecture"
          className="mb-6"
        />
        <p className="text-base text-muted-foreground mb-6">
          High-level overview of how all components interact — from user
          requests through the frontend and backend to the database and AI
          services.
        </p>
        <div className="rounded-xl overflow-hidden border border-border bg-white p-4">
          <Image
            src="/system_architecture.png"
            alt="JuDDGES System Architecture Diagram showing the full data flow from user interface through FastAPI backend to Supabase PostgreSQL with pgvector and OpenAI embeddings"
            width={1200}
            height={700}
            className="w-full h-auto"
            priority
          />
        </div>
      </LightCard>

      {/* Data Pipeline Diagram */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Workflow}
          title="Data Pipeline"
          className="mb-6"
        />
        <p className="text-base text-muted-foreground mb-6">
          The ingestion pipeline transforms raw court judgment data from
          HuggingFace datasets into searchable, embedded documents in our
          vector database.
        </p>
        <div className="rounded-xl overflow-hidden border border-border bg-white p-4">
          <Image
            src="/diagram_paper.png"
            alt="JuDDGES Data Pipeline Diagram showing data flow from HuggingFace datasets through transformation and embedding to Supabase pgvector storage"
            width={900}
            height={500}
            className="w-full h-auto"
          />
        </div>
      </LightCard>

      {/* Technology Stack */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Server}
          title="Technology Stack"
          className="mb-6"
        />

        <div className="space-y-8">
          {/* Frontend */}
          <div>
            <SectionHeader title="Frontend" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              <TechBadge name="Next.js 15" category="frontend" />
              <TechBadge name="React 19" category="frontend" />
              <TechBadge name="Tailwind CSS 4" category="frontend" />
              <TechBadge name="Zustand" category="frontend" />
              <TechBadge name="React Query" category="frontend" />
              <TechBadge name="Radix UI" category="frontend" />
              <TechBadge name="Framer Motion" category="frontend" />
              <TechBadge name="TypeScript" category="frontend" />
            </div>
          </div>

          {/* Backend */}
          <div>
            <SectionHeader title="Backend" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              <TechBadge name="FastAPI" category="backend" />
              <TechBadge name="Python 3.12" category="backend" />
              <TechBadge name="LangChain" category="backend" />
              <TechBadge name="LangGraph" category="backend" />
              <TechBadge name="Celery" category="backend" />
              <TechBadge name="Pydantic" category="backend" />
              <TechBadge name="Poetry" category="backend" />
            </div>
          </div>

          {/* Database & Search */}
          <div>
            <SectionHeader title="Database & Search" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              <TechBadge name="PostgreSQL" category="database" />
              <TechBadge name="Supabase" category="database" />
              <TechBadge name="pgvector" category="database" />
              <TechBadge name="HNSW Index" category="database" />
              <TechBadge name="Meilisearch" category="database" />
              <TechBadge name="Redis" category="database" />
            </div>
          </div>

          {/* AI / ML */}
          <div>
            <SectionHeader title="AI / ML" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              <TechBadge name="OpenAI Embeddings" category="ai" />
              <TechBadge name="GPT-4" category="ai" />
              <TechBadge name="Cohere Reranker" category="ai" />
              <TechBadge name="RAG Pipeline" category="ai" />
              <TechBadge name="Langfuse" category="ai" />
            </div>
          </div>

          {/* Infrastructure */}
          <div>
            <SectionHeader title="Infrastructure" className="mb-4" />
            <div className="flex flex-wrap gap-2">
              <TechBadge name="Docker" category="infra" />
              <TechBadge name="Docker Compose" category="infra" />
              <TechBadge name="Supabase Auth" category="infra" />
              <TechBadge name="Docker Hub" category="infra" />
            </div>
          </div>
        </div>
      </LightCard>

      {/* Search Pipeline */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Search}
          title="Hybrid Search Pipeline"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          The core search combines BM25 full-text, pgvector semantic similarity,
          and Reciprocal Rank Fusion for optimal retrieval across legal documents.
        </p>

        <div className="space-y-0">
          <FlowStep
            step={1}
            title="Query Classification"
            description="Incoming queries are classified by type (case number, statute reference, conceptual question, or mixed) using regex heuristics. This determines the search strategy."
            icon={Brain}
          />
          <FlowStep
            step={2}
            title="Language Detection & Alpha Routing"
            description="Language is auto-detected (Polish/English) and an alpha parameter (0.0-1.0) is computed to balance keyword vs. semantic search weight based on query type."
            icon={Globe}
          />
          <FlowStep
            step={3}
            title="Parallel Retrieval"
            description="BM25 full-text search (PostgreSQL tsvector with language-aware tokenization) and pgvector HNSW approximate nearest neighbor search run in parallel for maximum throughput."
            icon={Zap}
          />
          <FlowStep
            step={4}
            title="Reciprocal Rank Fusion"
            description="Results from BM25 and vector search are merged using RRF (k=60) with the alpha-weighted blending, combining the precision of keyword matching with the recall of semantic similarity."
            icon={Layers}
          />
          <FlowStep
            step={5}
            title="Cross-Encoder Reranking"
            description="Optionally, a Cohere cross-encoder (rerank-v3.5) reranks the fused results for higher precision, especially valuable for nuanced legal queries."
            icon={Brain}
          />
          <FlowStep
            step={6}
            title="Response Assembly"
            description="Final results are assembled with document chunks, metadata, relevance scores, and timing information, then returned with pagination support."
            icon={HardDrive}
            isLast
          />
        </div>
      </LightCard>

      {/* Chat RAG Pipeline */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={MessageSquare}
          title="RAG Chat Pipeline"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          Retrieval-Augmented Generation enables conversational legal research
          by grounding LLM responses in actual court judgments.
        </p>

        <div className="space-y-0">
          <FlowStep
            step={1}
            title="User Question"
            description="The user asks a legal research question in natural language through the chat interface, which supports multi-turn conversations."
            icon={MessageSquare}
          />
          <FlowStep
            step={2}
            title="Vector Retrieval"
            description="The question is embedded and used to retrieve the most relevant judgment passages from the pgvector index using semantic similarity."
            icon={Search}
          />
          <FlowStep
            step={3}
            title="Context Construction"
            description="Retrieved judgment excerpts are assembled into a structured context prompt with source attribution, ensuring the LLM has grounded factual material."
            icon={Layers}
          />
          <FlowStep
            step={4}
            title="LLM Generation & Streaming"
            description="GPT-4 generates a response using the retrieved context. The response is streamed in real-time to the frontend, with inline citations linking back to source judgments."
            icon={Zap}
            isLast
          />
        </div>
      </LightCard>

      {/* Database Architecture */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Database}
          title="Database Architecture"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-8">
          PostgreSQL with pgvector extension powers both structured queries and
          semantic vector search in a single database.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
                <Database className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-2">Judgments Table</div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Court name, date, case number</li>
                  <li>Full judgment text and summary</li>
                  <li>Jurisdiction (PL / UK)</li>
                  <li>Legal references and citations</li>
                  <li>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      embedding vector(768)
                    </code>{" "}
                    column
                  </li>
                </ul>
              </div>
            </div>
          </LightCard>

          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
                <Zap className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-2">Indexing Strategy</div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>HNSW index for fast vector ANN search</li>
                  <li>GIN index for full-text tsvector search</li>
                  <li>B-tree indexes on date, jurisdiction, court</li>
                  <li>Unaccent extension for Polish diacritics</li>
                  <li>10+ indexes for optimal query plans</li>
                </ul>
              </div>
            </div>
          </LightCard>

          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
                <Globe className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-2">Multi-Jurisdiction</div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Polish courts (Saos API source)</li>
                  <li>UK courts (National Archives source)</li>
                  <li>HuggingFace datasets for bulk ingestion</li>
                  <li>Unified schema across jurisdictions</li>
                  <li>Cross-lingual search support</li>
                </ul>
              </div>
            </div>
          </LightCard>

          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0">
                <Shield className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-2">Security & Auth</div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Supabase Auth with JWT tokens</li>
                  <li>Row-Level Security (RLS) policies</li>
                  <li>API key authentication for backend</li>
                  <li>CORS and rate limiting (SlowAPI)</li>
                  <li>Environment-based secrets management</li>
                </ul>
              </div>
            </div>
          </LightCard>
        </div>
      </LightCard>

      {/* Deployment Architecture */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Container}
          title="Deployment Architecture"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          Docker-based deployment with semantic versioning and one-command
          rollback support.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Container className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-1.5">Docker Services</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  Three containers: Next.js frontend, FastAPI backend, and
                  Celery worker (reuses backend image). Docker Compose
                  orchestrates both dev and production.
                </div>
              </div>
            </div>
          </LightCard>

          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <MonitorSmartphone className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-1.5">Dev Environment</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  Hot reload with volume mounts, Turbopack for fast frontend
                  builds, and automatic API restart on code changes.
                </div>
              </div>
            </div>
          </LightCard>

          <LightCard padding="md">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Shield className="size-6" />
              </div>
              <div>
                <div className="font-semibold mb-1.5">Production</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  Semantic versioned images pushed to Docker Hub, with deploy
                  history tracking and instant rollback to previous versions.
                </div>
              </div>
            </div>
          </LightCard>
        </div>

        {/* Port Configuration */}
        <div className="mt-8">
          <SectionHeader title="Port Configuration" className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl bg-muted/30 p-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Frontend Dev
              </div>
              <div className="text-xl font-bold font-mono">:3007</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Frontend Prod
              </div>
              <div className="text-xl font-bold font-mono">:3006</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Backend Dev
              </div>
              <div className="text-xl font-bold font-mono">:8004</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                Backend Prod
              </div>
              <div className="text-xl font-bold font-mono">:8002</div>
            </div>
          </div>
        </div>
      </LightCard>

      {/* CTA */}
      <div className="text-center py-12">
        <h2 className="text-3xl font-bold mb-6">Want to explore the platform?</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          See JuDDGES in action — search across thousands of court judgments
        </p>
        {user ? (
          <PrimaryButton
            size="lg"
            icon={ArrowRight}
            onClick={() => router.push("/search")}
          >
            Start Searching
          </PrimaryButton>
        ) : (
          <div className="flex gap-4 justify-center">
            <PrimaryButton
              size="lg"
              icon={ArrowRight}
              onClick={() => router.push("/auth/sign-up")}
            >
              Get Started
            </PrimaryButton>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

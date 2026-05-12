"use client";

import {
  Network,
  Github,
  ArrowRight,
  Users,
  Database,
  GitBranch,
  Sparkles,
  ExternalLink,
  FlaskConical,
  BookOpen,
  Globe,
  Mail,
  GraduationCap,
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
import { useRouter } from "next/navigation";
import { MermaidDiagram } from "@/components/ecosystem/MermaidDiagram";

const ECOSYSTEM_FLOW = `flowchart LR
    subgraph Sources["Raw Sources"]
        PL["Polish<br/>court judgments"]
        UK["England & Wales<br/>court judgments"]
    end

    subgraph MDX["Middlesex University team"]
        HITL["HITL Annotation Tool<br/><i>tsantosh7/hitl-tool</i>"]
        Experts["Legal experts<br/>verify spans"]
    end

    subgraph Shared["Shared open data"]
        HF["Hugging Face datasets<br/><i>huggingface.co/JuDDGES</i>"]
    end

    subgraph PWR["Wrocław University team"]
        Research["JuDDGES research repo<br/><i>pwr-ai/JuDDGES</i>"]
        App["JuDDGES App<br/><i>pwr-ai/juddges-app</i>"]
    end

    Users(("Researchers<br/>& legal pros"))

    PL --> HITL
    UK --> HITL
    HITL --> Experts
    Experts --> HF
    Research --> HF
    HF --> Research
    HF --> App
    App --> Users

    classDef src fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef mdx fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef shared fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef pwr fill:#ede9fe,stroke:#7c3aed,color:#4c1d95
    classDef users fill:#fce7f3,stroke:#db2777,color:#831843

    class PL,UK src
    class HITL,Experts mdx
    class HF shared
    class Research,App pwr
    class Users users
`;

type ProjectCard = {
  name: string;
  tagline: string;
  role: "this-app" | "upstream" | "parent";
  team: string;
  description: string;
  href: string;
  badges: string[];
};

const PROJECTS: ProjectCard[] = [
  {
    name: "JuDDGES (research)",
    tagline: "Parent research project",
    role: "parent",
    team: "Wrocław University of Science and Technology",
    description:
      "The umbrella research initiative on legal NLP and human-in-the-loop machine learning for Polish and England & Wales judicial decisions. Hosts datasets, NLP pipelines, model training code, and the published Hugging Face datasets that power downstream tools.",
    href: "https://github.com/pwr-ai/JuDDGES",
    badges: ["Datasets", "NLP pipelines", "HITL experiments", "Open science"],
  },
  {
    name: "HITL Annotation Tool",
    tagline: "Upstream — human annotation workbench",
    role: "upstream",
    team: "Middlesex University, London (UK partner team)",
    description:
      "A dedicated human-in-the-loop annotation workbench used by domain experts to verify and correct LLM extractions over UK criminal court judgments across 43 canonical legal fields. Produces verified ground-truth annotations that feed back into JuDDGES datasets and benchmarks.",
    href: "https://github.com/tsantosh7/hitl-tool",
    badges: [
      "Human-in-the-loop",
      "Span verification",
      "UK criminal cases",
      "Hypothes.is integration",
    ],
  },
  {
    name: "JuDDGES App",
    tagline: "This platform — research instrument",
    role: "this-app",
    team: "Wrocław University of Science and Technology",
    description:
      "The web platform you are using right now. Provides hybrid semantic + full-text search, dynamic schema-driven extraction, and analytics over Polish and England & Wales judgments. Designed as an open research instrument that consumes datasets and models produced upstream.",
    href: "https://github.com/pwr-ai/juddges-app",
    badges: [
      "Hybrid search",
      "Schema generator",
      "Analytics",
      "Open source",
    ],
  },
];

const FLOW_STEPS = [
  {
    icon: Users,
    title: "Human annotators verify",
    description:
      "Legal experts review and correct LLM-generated extractions in the HITL Annotation Tool, producing high-quality ground-truth spans for 43 canonical fields.",
    where: "HITL Annotation Tool",
  },
  {
    icon: Database,
    title: "Datasets are published",
    description:
      "Verified annotations and curated judgment corpora are released on Hugging Face under the JuDDGES organization, openly available to the research community.",
    where: "huggingface.co/JuDDGES",
  },
  {
    icon: FlaskConical,
    title: "Research is enabled",
    description:
      "Researchers query and extract structured data from judgments through this platform — backed by the datasets and models produced upstream by the wider JuDDGES collaboration.",
    where: "JuDDGES App (this site)",
  },
];

export default function EcosystemPage(): React.JSX.Element {
  const router = useRouter();

  return (
    <PageContainer width="standard" className="py-12">
      {/* Hero */}
      <div className="mb-16">
        <Badge variant="outline" className="mb-6">
          Open Source Collaboration
        </Badge>
        <Header
          icon={Network}
          title="The JuDDGES Ecosystem"
          size="4xl"
          description="Three open-source projects, two collaborating teams, one shared mission: making judicial decision research transparent, reproducible, and accessible."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="https://juddges.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-background hover:bg-primary/5 text-sm font-medium text-primary transition-colors duration-200"
          >
            <Globe className="size-4" />
            juddges.org
            <ExternalLink className="size-3.5 opacity-60" />
          </a>
          <a
            href="https://huggingface.co/JuDDGES"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-background hover:bg-muted/50 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <BookOpen className="size-4" />
            Hugging Face datasets
            <ExternalLink className="size-3.5 opacity-60" />
          </a>
        </div>
      </div>

      {/* Narrative intro */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Sparkles}
          title="A collaboration, not a monolith"
          className="mb-3"
        />
        <p className="text-base leading-relaxed mb-4">
          JuDDGES is intentionally built as a federation of focused tools rather than
          a single application. Each project is independently deployable, has its own
          maintainers, and lives in a separate Git repository — but they share a common
          mission and form a coherent research pipeline. This page maps out who builds
          what, and how the pieces fit together.
        </p>
        <p className="text-base leading-relaxed">
          The work is shared between the team at Wrocław University of Science and Technology
          (this platform and the parent research project) and partner contributors maintaining
          the human-in-the-loop annotation workbench. Both sides release their code under
          permissive open-source licenses, so the entire pipeline — from raw judgment text
          to verified annotations to user-facing search — can be inspected, reproduced, or
          extended by anyone.
        </p>
      </LightCard>

      {/* Projects */}
      <div className="mb-10">
        <SecondaryHeader
          icon={GitBranch}
          title="Projects in the ecosystem"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          Each repository is open-source and independently versioned.
        </p>

        <div className="space-y-5">
          {PROJECTS.map((project) => (
            <LightCard key={project.name} padding="lg">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="text-2xl font-semibold tracking-tight">
                      {project.name}
                    </h3>
                    {project.role === "this-app" && (
                      <Badge variant="default" className="text-xs">
                        You are here
                      </Badge>
                    )}
                    {project.role === "upstream" && (
                      <Badge variant="secondary" className="text-xs">
                        Upstream
                      </Badge>
                    )}
                    {project.role === "parent" && (
                      <Badge variant="secondary" className="text-xs">
                        Parent project
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{project.tagline}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Maintained by: {project.team}
                  </p>
                </div>
                <SecondaryButton
                  onClick={() => window.open(project.href, "_blank")}
                  className="shrink-0"
                >
                  <Github className="size-4 mr-2" />
                  View on GitHub
                  <ExternalLink className="size-3.5 ml-2 opacity-60" />
                </SecondaryButton>
              </div>

              <p className="text-base leading-relaxed mb-5">{project.description}</p>

              <div className="flex flex-wrap gap-2">
                {project.badges.map((b) => (
                  <Badge key={b} variant="outline" className="text-xs px-2.5 py-1">
                    {b}
                  </Badge>
                ))}
              </div>
            </LightCard>
          ))}
        </div>
      </div>

      {/* Data flow */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Database}
          title="How data flows through the pipeline"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          From raw judgment text to research insight, in three stages — each owned by a
          different part of the collaboration.
        </p>

        {/* Pipeline diagram */}
        <div className="mb-8 rounded-2xl border border-border bg-background/50 p-4 md:p-6 overflow-x-auto">
          <MermaidDiagram
            chart={ECOSYSTEM_FLOW}
            className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            ariaLabel="JuDDGES ecosystem data flow: court judgments are annotated by experts via the HITL tool maintained at Middlesex University, the verified data is published as Hugging Face datasets shared with the Wrocław University team, which uses them in the JuDDGES research repository and serves them to researchers through the JuDDGES App."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FLOW_STEPS.map((step, i) => (
            <LightCard key={step.title} padding="md">
              <div className="text-5xl font-light text-primary/20 mb-3 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <step.icon className="size-5 text-primary" />
                <h4 className="font-semibold">{step.title}</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {step.description}
              </p>
              <Badge variant="secondary" className="text-xs">
                {step.where}
              </Badge>
            </LightCard>
          ))}
        </div>
      </LightCard>

      {/* Why federated */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Users}
          title="Why a federated ecosystem?"
          className="mb-3"
        />
        <div className="space-y-4">
          <p className="text-base leading-relaxed">
            Annotation workbenches and research platforms are very different beasts.
            Annotation tools optimize for expert-user ergonomics, low-friction span
            editing, and dataset export. Research platforms optimize for scale, hybrid
            retrieval, multi-tenant access control, and rich analytics. Mashing them into
            one codebase would force compromises on both sides.
          </p>
          <p className="text-base leading-relaxed">
            By keeping the projects separate but linked through shared open data formats
            (Hugging Face datasets, JSONL exports, common code lists), each team can
            iterate on their own cadence, target their own users, and still contribute to
            a coherent whole.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
            <div>
              <SectionHeader title="Shared standards" className="mb-2" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Verbatim span extractions, controlled vocabularies of legal codes, and the
                Hugging Face dataset format are the lingua franca between projects.
              </p>
            </div>
            <div>
              <SectionHeader title="Independent releases" className="mb-2" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each repo has its own versioning, CI, and deployment pipeline. Breaking
                changes in one tool don&apos;t block work in the other.
              </p>
            </div>
            <div>
              <SectionHeader title="Open by default" className="mb-2" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                All code is published under permissive licenses; datasets are released
                openly on Hugging Face for reproducibility and reuse.
              </p>
            </div>
          </div>
        </div>
      </LightCard>

      {/* Team contacts */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader
          icon={Users}
          title="Who maintains what"
          className="mb-3"
        />
        <p className="text-base text-muted-foreground mb-6">
          The collaboration is split between two academic teams across two universities.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* PWR team */}
          <LightCard padding="md">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <GraduationCap className="size-5" />
              </div>
              <div>
                <div className="font-semibold">JuDDGES App & research repo</div>
                <div className="text-xs text-muted-foreground">
                  Wrocław University of Science and Technology
                </div>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <a
                href="mailto:lukasz.augustyniak@pwr.edu.pl"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Łukasz Augustyniak</span>{" "}
                  &mdash; lukasz.augustyniak@pwr.edu.pl
                </span>
              </a>
            </div>
          </LightCard>

          {/* Middlesex team */}
          <LightCard padding="md">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <GraduationCap className="size-5" />
              </div>
              <div>
                <div className="font-semibold">HITL Annotation Tool</div>
                <div className="text-xs text-muted-foreground">
                  Middlesex University, London
                </div>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <a
                href="mailto:m.dhami@mdx.ac.uk"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    Prof. Mandeep K. Dhami
                  </span>{" "}
                  &mdash; m.dhami@mdx.ac.uk
                </span>
              </a>
              <a
                href="mailto:d.windridge@mdx.ac.uk"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    Prof. David Windridge
                  </span>{" "}
                  &mdash; d.windridge@mdx.ac.uk
                </span>
              </a>
              <a
                href="https://github.com/tsantosh7"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    Santosh Tirunagari
                  </span>{" "}
                  &mdash; @tsantosh7 (developer)
                </span>
              </a>
            </div>
          </LightCard>
        </div>
      </LightCard>

      {/* Resources */}
      <LightCard padding="lg" className="mb-10">
        <SecondaryHeader title="Explore the ecosystem" className="mb-3" />
        <p className="text-base text-muted-foreground mb-6">
          Direct links to the repositories, project website, and shared resources.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SecondaryButton
            className="h-auto py-6"
            onClick={() => window.open("https://juddges.org", "_blank")}
          >
            <div className="flex flex-col items-center gap-3">
              <Globe className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">juddges.org</div>
                <div className="text-xs text-muted-foreground">
                  Project website
                </div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton
            className="h-auto py-6"
            onClick={() =>
              window.open("https://github.com/pwr-ai/JuDDGES", "_blank")
            }
          >
            <div className="flex flex-col items-center gap-3">
              <Github className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">JuDDGES (research)</div>
                <div className="text-xs text-muted-foreground">
                  Parent research project
                </div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton
            className="h-auto py-6"
            onClick={() =>
              window.open("https://github.com/tsantosh7/hitl-tool", "_blank")
            }
          >
            <div className="flex flex-col items-center gap-3">
              <Github className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">HITL Annotation Tool</div>
                <div className="text-xs text-muted-foreground">
                  Human-in-the-loop workbench
                </div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton
            className="h-auto py-6"
            onClick={() =>
              window.open("https://github.com/pwr-ai/juddges-app", "_blank")
            }
          >
            <div className="flex flex-col items-center gap-3">
              <Github className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">JuDDGES App</div>
                <div className="text-xs text-muted-foreground">This platform</div>
              </div>
            </div>
          </SecondaryButton>

          <SecondaryButton
            className="h-auto py-6"
            onClick={() => window.open("https://huggingface.co/JuDDGES", "_blank")}
          >
            <div className="flex flex-col items-center gap-3">
              <BookOpen className="size-6" />
              <div className="text-center">
                <div className="font-semibold mb-1">Hugging Face datasets</div>
                <div className="text-xs text-muted-foreground">
                  Shared open datasets
                </div>
              </div>
            </div>
          </SecondaryButton>
        </div>
      </LightCard>

      {/* CTA */}
      <div className="text-center py-12">
        <h2 className="text-3xl font-bold mb-4">Want to collaborate?</h2>
        <p className="text-muted-foreground mb-8 text-lg">
          Both repositories welcome contributions. Open an issue, propose a feature,
          or join the discussion.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <PrimaryButton
            size="lg"
            icon={ArrowRight}
            onClick={() => router.push("/contact")}
          >
            Get in touch
          </PrimaryButton>
          <SecondaryButton size="lg" onClick={() => router.push("/about")}>
            About JuDDGES
          </SecondaryButton>
        </div>
      </div>
    </PageContainer>
  );
}

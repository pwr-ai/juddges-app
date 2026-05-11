import type { Metadata } from "next";
import Image from "next/image";
import { Search, FolderOpen, MessageSquare, FileJson } from "lucide-react";
import {
  EditorialCard,
  EditorialButton,
  Rule,
} from "@/components/editorial";
import { PageContainer } from "@/lib/styles/components";

export const metadata: Metadata = {
  title: "Get started — JUDDGES",
  description:
    "A 30-minute tour of JUDDGES for legal researchers: search the corpus, build a collection, ask a question with cited sources, and read the base coding schema.",
};

interface Step {
  index: string;
  title: string;
  summary: string;
  bullets: string[];
  cta: { href: string; label: string };
  icon: React.ComponentType<{ className?: string }>;
  screenshot: { src: string; alt: string } | null;
}

const STEPS: Step[] = [
  {
    index: "01",
    title: "Search the corpus",
    summary:
      "Hybrid semantic + full-text search across Polish and England & Wales judgments. Combine natural-language questions with jurisdiction, court, and date filters.",
    bullets: [
      "Phrase queries as you would ask a colleague — semantic ranking surfaces concept matches, not just keyword hits.",
      "Filter by jurisdiction (PL · UK), language, date range, and issuing body using the right-hand panel.",
      "Each result shows jurisdiction and document-type badges; open one to read the full judgment, or save the entire search via the Save Search button.",
    ],
    cta: { href: "/search?q=unfair+dismissal", label: "Try the example search" },
    icon: Search,
    screenshot: {
      src: "/docs/onboarding/step-1-search.png",
      alt: "Search page showing results for the query 'unfair dismissal' — a UK Court of Appeal judgment with jurisdiction badges, alongside the filters panel for date, language, and issuing bodies.",
    },
  },
  {
    index: "02",
    title: "Build a collection",
    summary:
      "Group judgments into reusable research sets. Collections persist across sessions, support inline name and description editing, and feed into extraction pipelines later on.",
    bullets: [
      "Click + New Collection to create one; name and description can be edited inline afterwards.",
      "Add judgments from the search results list, from the document view, or import a batch of IDs.",
      "Re-order, rename, and delete from the Collections list; each collection has its own detail page with sortable columns and bulk actions.",
    ],
    cta: { href: "/collections", label: "Open collections" },
    icon: FolderOpen,
    screenshot: {
      src: "/docs/onboarding/step-2-collections.png",
      alt: "Collections list page with the heading, search box, sort dropdown, an existing collection card, and the + New Collection button.",
    },
  },
  {
    index: "03",
    title: "Ask a question with cited sources",
    summary:
      "Retrieval-augmented chat over the corpus. Every claim is anchored to a judgment — click a citation to land on the cited paragraph in the source document.",
    bullets: [
      "Start from one of the example questions or ask a doctrinal or fact-pattern question in Polish or English.",
      "Pick a response format from the dropdown — Adaptive lets the assistant choose between prose, list, table, or step-by-step answer.",
      "Each answer is followed by a cited-sources panel; clicking a citation lands you on the cited paragraph inside the source judgment.",
    ],
    cta: { href: "/chat", label: "Open chat" },
    icon: MessageSquare,
    screenshot: {
      src: "/docs/onboarding/step-3-chat.png",
      alt: "Chat landing page with the heading 'What legal question can JuDDGES help you with?', the message input, an Adaptive response-format selector, and a grid of four example questions across General, Tax Law, and Court Judgments categories.",
    },
  },
  {
    index: "04",
    title: "Read the base coding schema",
    summary:
      "The canonical extraction template used across JUDDGES pipelines — 51 fields covering case identifiers, parties, court hierarchy, dates, legal grounds, and outcomes. Reviewing it before designing your own coding scheme is the fastest way to avoid reinventing fields that already exist.",
    bullets: [
      "Toggle between Table and JSON views; the Table view is searchable across all 51 fields.",
      "Switch between English and Polish field definitions using the Schema language selector.",
      "Copy or download the schema as JSON to seed your own extraction project or to feed into a coding-schema agent.",
    ],
    cta: { href: "/schemas/base", label: "Open base schema" },
    icon: FileJson,
    screenshot: {
      src: "/docs/onboarding/step-4-base-schema.png",
      alt: "Base Judgment Extraction Schema page showing the schema_key, the English/Polish language switcher, '51 fields · 51 required' summary, Table / JSON view tabs, the fields search bar, and the first few fields (Keywords, Neutral citation number, Case number, Date of appeal court judgment, Appeal court judges names) with type and description columns.",
    },
  },
];

export default function OnboardingPage(): React.JSX.Element {
  return (
    <PageContainer width="standard" className="py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          First 30 minutes
        </p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Get started with JUDDGES
        </h1>
        <p className="font-serif text-lg italic leading-snug text-ink-soft">
          A four-step tour for legal researchers — search the corpus, build a
          collection, ask a question with cited sources, and read the base coding
          schema.
        </p>
        <Rule weight="ink" className="mt-2" />
      </div>

      <ol className="flex flex-col gap-6">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.index}>
              <EditorialCard className="overflow-hidden">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="flex flex-col gap-3 lg:col-span-5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                        Step {step.index}
                      </span>
                      <Icon className="size-4 text-ink-soft" aria-hidden />
                    </div>
                    <h2 className="font-serif text-2xl leading-snug text-ink">
                      {step.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-ink">
                      {step.summary}
                    </p>
                    <ul className="mt-1 flex flex-col gap-2">
                      {step.bullets.map((b, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm leading-relaxed text-ink-soft"
                        >
                          <span
                            aria-hidden
                            className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-oxblood"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-3">
                      <EditorialButton
                        variant="primary"
                        size="sm"
                        href={step.cta.href}
                        arrow
                      >
                        {step.cta.label}
                      </EditorialButton>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    {step.screenshot ? (
                      <figure className="border border-rule bg-parchment-deep/30">
                        <Image
                          src={step.screenshot.src}
                          alt={step.screenshot.alt}
                          width={1440}
                          height={900}
                          className="h-auto w-full"
                          priority={step.index === "01"}
                        />
                      </figure>
                    ) : (
                      <div className="flex h-full min-h-[260px] items-center justify-center border border-dashed border-rule bg-parchment-deep/20 p-6 text-center">
                        <p className="font-serif text-sm italic text-ink-soft">
                          Screenshot coming next — run{" "}
                          <code className="font-mono text-xs text-ink">
                            npm run docs:screens
                          </code>{" "}
                          to regenerate.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </EditorialCard>
            </li>
          );
        })}
      </ol>

      <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center gap-3 text-center">
        <Rule weight="hairline" />
        <p className="text-sm text-ink-soft">
          Want the long form with deeper walk-throughs?
        </p>
        <EditorialButton
          variant="ghost"
          size="sm"
          href="https://github.com/pwr-ai/juddges-app/blob/main/docs/tutorials/first-30-minutes.md"
          external
          arrow
        >
          Read the full tutorial
        </EditorialButton>
      </div>
    </PageContainer>
  );
}

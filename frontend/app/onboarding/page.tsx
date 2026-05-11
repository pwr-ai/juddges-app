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
      "Filter by jurisdiction (PL · UK), court level, and date range; the indicator beside each result shows the ranking signal.",
      "Open any result to read the full judgment with cited legislation and AI-extracted highlights.",
    ],
    cta: { href: "/search", label: "Open search" },
    icon: Search,
    screenshot: null,
  },
  {
    index: "02",
    title: "Build a collection",
    summary:
      "Group judgments into reusable research sets. Collections persist across sessions, support inline description editing, and feed into extraction pipelines later on.",
    bullets: [
      "Save a result straight from the search list or from a document page.",
      "Rename, describe, and re-order collections from the Library sidebar.",
      "Collections become the input for hybrid-search filtering and downstream coding-schema runs.",
    ],
    cta: { href: "/collections", label: "Open collections" },
    icon: FolderOpen,
    screenshot: null,
  },
  {
    index: "03",
    title: "Ask a question with cited sources",
    summary:
      "Retrieval-augmented chat over the corpus. Every claim is anchored to a judgment — click a citation to land on the cited paragraph in the source document.",
    bullets: [
      "Ask doctrinal or fact-pattern questions in Polish or English.",
      "The cited-sources panel surfaces each judgment used to compose the answer.",
      "Citations link back to the document view with the cited section highlighted.",
    ],
    cta: { href: "/chat", label: "Open chat" },
    icon: MessageSquare,
    screenshot: null,
  },
  {
    index: "04",
    title: "Read the base coding schema",
    summary:
      "The canonical extraction template used across JUDDGES pipelines — review the field definitions, types, and locales (EN / PL) in one place.",
    bullets: [
      "Browse the field list with descriptions and example values.",
      "Switch between English and Polish locale variants.",
      "Use this as the reference when planning your own extraction work.",
    ],
    cta: { href: "/schemas/base", label: "Open base schema" },
    icon: FileJson,
    screenshot: null,
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

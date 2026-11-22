"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Eyebrow, Headline, Rule } from "@/components/editorial";
import { searchV2ErrorMessage } from "@/components/search/v2/SearchV2Panel";
import {
  getJudgmentV2,
  SearchV2Error,
  type SearchV2Judgment,
} from "@/lib/api/search-v2";

const COURT_TYPE_LABELS: Record<string, string> = {
  ordinary_court: "Sąd powszechny",
  administrative_court: "Sąd administracyjny",
};

const SOURCE_LABELS: Record<string, string> = {
  "pl-court": "Portal Orzeczeń Sądów Powszechnych",
  nsa: "Centralna Baza Orzeczeń Sądów Administracyjnych",
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-[color:var(--rule)] py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
        {label}
      </dt>
      <dd className="text-sm text-[color:var(--ink)]">{children}</dd>
    </div>
  );
}

function MetaList({ items }: { items: string[] }): React.JSX.Element {
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function JudgmentBody({ judgment }: { judgment: SearchV2Judgment }): React.JSX.Element {
  const keywords = judgment.keywords ?? [];
  const judges = judgment.judges ?? [];
  const legalBases = judgment.legal_bases ?? [];
  const references = judgment.references ?? [];
  const courtType = judgment.court_type
    ? COURT_TYPE_LABELS[judgment.court_type] ?? judgment.court_type
    : null;
  const source = judgment.source ? SOURCE_LABELS[judgment.source] ?? judgment.source : null;

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <Eyebrow tone="oxblood">Pełna baza · Weaviate</Eyebrow>
        <Headline as="h1" size="sm">
          {judgment.signature || judgment.judgment_id}
        </Headline>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
          {[judgment.court_name, judgment.department_name, judgment.decision_date]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p
          role="note"
          className="border-l-2 border-[color:var(--gold)] bg-[color:var(--parchment-deep)] px-3 py-2 text-sm text-[color:var(--ink)]"
        >
          Orzeczenie z pełnej bazy (bez ekstrakcji).
          {judgment.supabase_id && (
            <>
              {" "}
              <Link
                href={`/documents/${judgment.supabase_id}`}
                className="font-medium text-[color:var(--oxblood)] underline underline-offset-4"
              >
                Otwórz w bazie kuratorowanej
              </Link>
            </>
          )}
        </p>
      </header>

      {judgment.thesis && (
        <section aria-labelledby="full-judgment-thesis" className="space-y-2">
          <Eyebrow as="p" id="full-judgment-thesis">
            Teza
          </Eyebrow>
          <blockquote className="border-l-2 border-[color:var(--gold)] pl-4 font-serif text-lg leading-relaxed text-[color:var(--ink)]">
            {judgment.thesis}
          </blockquote>
        </section>
      )}

      <section aria-labelledby="full-judgment-meta">
        <Eyebrow as="p" id="full-judgment-meta" className="mb-2">
          Metryka
        </Eyebrow>
        <dl>
          {courtType && <MetaRow label="Rodzaj sądu">{courtType}</MetaRow>}
          {judgment.judgment_type && <MetaRow label="Rodzaj orzeczenia">{judgment.judgment_type}</MetaRow>}
          {judgment.presiding_judge && (
            <MetaRow label="Przewodniczący">{judgment.presiding_judge}</MetaRow>
          )}
          {judges.length > 0 && (
            <MetaRow label="Skład">
              <MetaList items={judges} />
            </MetaRow>
          )}
          {keywords.length > 0 && (
            <MetaRow label="Słowa kluczowe">{keywords.join(", ")}</MetaRow>
          )}
          {legalBases.length > 0 && (
            <MetaRow label="Podstawa prawna">
              <MetaList items={legalBases} />
            </MetaRow>
          )}
          {references.length > 0 && (
            <MetaRow label="Powołane przepisy">
              <MetaList items={references} />
            </MetaRow>
          )}
          {source && (
            <MetaRow label="Źródło">
              {judgment.source_url ? (
                <a
                  href={judgment.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--oxblood)] underline underline-offset-4"
                >
                  {source}
                </a>
              ) : (
                source
              )}
            </MetaRow>
          )}
          <MetaRow label="Identyfikator">
            <span className="font-mono text-xs break-all">{judgment.judgment_id}</span>
          </MetaRow>
        </dl>
      </section>

      <Rule weight="medium" />

      <section aria-labelledby="full-judgment-text" className="space-y-3">
        <Eyebrow as="p" id="full-judgment-text">
          Treść orzeczenia
        </Eyebrow>
        {judgment.full_text ? (
          <div className="max-w-prose whitespace-pre-line text-[15px] leading-7 text-[color:var(--ink)]">
            {judgment.full_text}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--ink-soft)]">Brak treści orzeczenia w bazie.</p>
        )}
        {judgment.full_text_truncated && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Treść skrócona — pełny tekst w źródle.
          </p>
        )}
      </section>
    </article>
  );
}

export function FullJudgmentView({ judgmentId }: { judgmentId: string }): React.JSX.Element {
  const query = useQuery<SearchV2Judgment, Error>({
    queryKey: ["search-v2-judgment", judgmentId],
    queryFn: ({ signal }) => getJudgmentV2(judgmentId, signal),
    retry: (count, error) =>
      count < 1 && !(error instanceof SearchV2Error && [400, 401, 404].includes(error.status)),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/search?engine=full"
        className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--ink-soft)] hover:text-[color:var(--oxblood)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Wróć do wyszukiwania
      </Link>

      {query.isPending && (
        <p role="status" className="text-sm text-[color:var(--ink-soft)]">
          Wczytuję orzeczenie…
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-sm text-[color:var(--oxblood)]">
          {query.error instanceof SearchV2Error && query.error.status === 404
            ? "Nie znaleziono orzeczenia w pełnej bazie."
            : searchV2ErrorMessage(query.error)}
        </p>
      )}
      {query.data && <JudgmentBody judgment={query.data} />}
    </div>
  );
}

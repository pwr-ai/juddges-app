"use client";

import Link from "next/link";

import { Eyebrow } from "@/components/editorial";
import {
  searchV2ResultHref,
  type SearchV2Response,
  type SearchV2Result,
} from "@/lib/api/search-v2";
import { useOptionalTranslation } from "@/contexts/LanguageContext";
import { ENGINE_RESULTS_KEY } from "./SearchEngineSelector";

function SearchV2ResultItem({ result }: { result: SearchV2Result }): React.JSX.Element {
  const label = result.signature || result.judgment_id;
  return (
    <li className="border-t border-[color:var(--rule)] py-5 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Link
            href={searchV2ResultHref(result)}
            className="hover:text-[color:var(--oxblood)] hover:underline underline-offset-4"
          >
            <h3 className="font-serif text-xl leading-tight text-[color:var(--ink)]">{label}</h3>
          </Link>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            {result.court_name && <span>{result.court_name}</span>}
            {result.court_name && result.decision_date && <span aria-hidden> · </span>}
            {result.decision_date && <span>{result.decision_date}</span>}
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-sm tabular-nums text-[color:var(--ink)]"
          title="Hybrid relative score of the best chunk"
        >
          {result.score.toFixed(3)}
        </span>
      </div>

      {result.thesis && (
        <p className="mt-3 border-l-2 border-[color:var(--gold)] pl-3 text-sm italic text-[color:var(--ink)]">
          {result.thesis}
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-soft)]">
        {result.best_chunk.text}
      </p>

      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
        {result.supabase_id ? "także w bazie porównawczej" : "tylko w pełnej bazie (bez ekstrakcji)"}
      </p>
    </li>
  );
}

export function SearchV2Results({
  response,
}: {
  response: SearchV2Response;
}): React.JSX.Element {
  const { t } = useOptionalTranslation();
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow as="p" tone="oxblood">
          {t(ENGINE_RESULTS_KEY.full)}
        </Eyebrow>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)] tabular-nums">
          {response.results.length} orzeczeń · {response.took_ms} ms
        </p>
      </div>
      {response.results.length === 0 ? (
        <p className="py-8 text-center text-[color:var(--ink-soft)]">
          Brak wyników w pełnej bazie dla tego zapytania.
        </p>
      ) : (
        <ol>
          {response.results.map((result) => (
            <SearchV2ResultItem key={result.judgment_id} result={result} />
          ))}
        </ol>
      )}
    </div>
  );
}

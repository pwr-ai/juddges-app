import Link from "next/link";

import type { SearchV2Response, SearchV2Result } from "@/lib/api/search-v2";

function ResultHeading({ result }: { result: SearchV2Result }): React.JSX.Element {
  const label = result.signature || result.judgment_id;
  const heading = (
    <h3 className="font-serif text-xl leading-tight text-[color:var(--ink)]">{label}</h3>
  );
  if (!result.supabase_id) return heading;
  return (
    <Link
      href={`/documents/${result.supabase_id}`}
      className="hover:text-[color:var(--oxblood)] hover:underline underline-offset-4"
    >
      {heading}
    </Link>
  );
}

function SearchV2ResultItem({ result }: { result: SearchV2Result }): React.JSX.Element {
  return (
    <li className="border-t border-[color:var(--rule)] py-5 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <ResultHeading result={result} />
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

      {!result.supabase_id && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
          spoza bazy aplikacji (tylko v2)
        </p>
      )}
    </li>
  );
}

export function SearchV2Results({
  response,
}: {
  response: SearchV2Response;
}): React.JSX.Element {
  if (response.results.length === 0) {
    return (
      <p className="py-8 text-center text-[color:var(--ink-soft)]">
        No results in the v2 corpus for this query.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
        {response.results.length} judgments · {response.took_ms} ms · {response.engine}
      </p>
      <ol>
        {response.results.map((result) => (
          <SearchV2ResultItem key={result.judgment_id} result={result} />
        ))}
      </ol>
    </div>
  );
}

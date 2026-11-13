"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { EditorialButton, StatusBadge } from "@/components/editorial";
import { searchV2, SearchV2Error, type SearchV2Response } from "@/lib/api/search-v2";
import { SearchV2Results } from "./SearchV2Results";

/** Backend 503 detail while the `WEAVIATE_V2_*` env is unset. */
const NOT_CONFIGURED_DETAIL = "search v2 not configured";

/**
 * User-facing error text. Both kinds of 503 get their own copy: an unset env
 * is a config problem, while an unreachable v2 stack or backend is an outage.
 */
export function searchV2ErrorMessage(error: Error): string {
  if (error instanceof SearchV2Error && error.status === 503) {
    return error.message === NOT_CONFIGURED_DETAIL
      ? "v2 nieskonfigurowane: wyszukiwarka v2 nie jest włączona na tym serwerze."
      : "v2 niedostępne: usługa v2 chwilowo nie odpowiada. Spróbuj ponownie później.";
  }
  return error.message;
}

/**
 * Self-contained search over the v2 (Weaviate) test corpus (issue #867).
 *
 * Deliberately independent of the standard search store, URL params and
 * result cache: switching engines never disturbs the standard path.
 */
export function SearchV2Panel({ initialQuery = "" }: { initialQuery?: string }): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const mutation = useMutation<SearchV2Response, Error, string>({
    mutationFn: (q) => searchV2({ query: q }),
  });

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) mutation.mutate(trimmed);
  };

  return (
    <section aria-label="Search v2 (Weaviate, test)" className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-3 text-center">
        <StatusBadge status="test" tone="oxblood" label="TEST" size="sm" />
        <p className="text-sm text-[color:var(--ink-soft)]">
          Experimental engine: hybrid search over the Weaviate v2 corpus. Results may differ from
          the standard search and include rulings outside the app database.
        </p>
      </div>

      <form onSubmit={submit} className="flex w-full gap-2" role="search">
        <label htmlFor="search-v2-query" className="sr-only">
          Search query (v2)
        </label>
        <input
          id="search-v2-query"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the v2 corpus…"
          maxLength={1000}
          className="min-w-0 flex-1 border border-[color:var(--rule-strong)] bg-[color:var(--parchment)] px-4 py-3 text-base text-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none"
        />
        <EditorialButton type="submit" loading={mutation.isPending} disabled={!query.trim()}>
          <Search className="h-4 w-4" aria-hidden />
          Search
        </EditorialButton>
      </form>

      {mutation.isPending && (
        <p role="status" className="text-center text-sm text-[color:var(--ink-soft)]">
          Searching the v2 corpus…
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-center text-sm text-[color:var(--oxblood)]">
          {searchV2ErrorMessage(mutation.error)}
        </p>
      )}
      {mutation.data && !mutation.isPending && <SearchV2Results response={mutation.data} />}
    </section>
  );
}

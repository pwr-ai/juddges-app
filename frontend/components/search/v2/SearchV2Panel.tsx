"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { EditorialButton } from "@/components/editorial";
import {
  searchV2,
  SearchV2Error,
  SESSION_EXPIRED_MESSAGE,
  type SearchV2Request,
  type SearchV2Response,
} from "@/lib/api/search-v2";
import { SearchV2Results } from "./SearchV2Results";

/** Backend 503 detail while the `WEAVIATE_V2_*` env is unset. */
const NOT_CONFIGURED_DETAIL = "search v2 not configured";

export const COURT_TYPE_OPTIONS = [
  { value: "", label: "Wszystkie sądy" },
  { value: "ordinary_court", label: "Sądy powszechne" },
  { value: "administrative_court", label: "Sądy administracyjne (NSA, WSA)" },
] as const;

/**
 * User-facing error text. Both kinds of 503 get their own copy: an unset env
 * is a config problem, while an unreachable stack or backend is an outage.
 */
export function searchV2ErrorMessage(error: Error): string {
  if (error instanceof SearchV2Error) {
    if (error.status === 401) return SESSION_EXPIRED_MESSAGE;
    if (error.status === 503) {
      return error.message === NOT_CONFIGURED_DETAIL
        ? "Pełna baza nieskonfigurowana: wyszukiwarka pełnej bazy nie jest włączona na tym serwerze."
        : "Pełna baza niedostępna: usługa chwilowo nie odpowiada. Spróbuj ponownie później.";
    }
  }
  return error.message;
}

const fieldClass =
  "border border-[color:var(--rule-strong)] bg-[color:var(--parchment)] px-3 py-2 text-sm text-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none";

/**
 * Search over the full corpus (Weaviate v2, ~2.7M Polish judgments).
 *
 * Independent of the curated search store and result cache; the page only
 * hears about the submitted query (`onSubmitQuery`) so it can keep `?q=`.
 */
export function SearchV2Panel({
  initialQuery = "",
  onSubmitQuery,
}: {
  initialQuery?: string;
  onSubmitQuery?: (query: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [courtType, setCourtType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const mutation = useMutation<SearchV2Response, Error, SearchV2Request>({
    mutationFn: (request) => searchV2(request),
  });

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const request: SearchV2Request = { query: trimmed };
    if (courtType) request.court_type = [courtType];
    if (dateFrom) request.date_from = dateFrom;
    if (dateTo) request.date_to = dateTo;
    onSubmitQuery?.(trimmed);
    mutation.mutate(request);
  };

  return (
    <section aria-label="Wyszukiwanie w pełnej bazie" className="w-full space-y-6">
      <form onSubmit={submit} className="w-full space-y-3" role="search">
        <div className="flex w-full gap-2">
          <label htmlFor="search-v2-query" className="sr-only">
            Zapytanie (pełna baza)
          </label>
          <input
            id="search-v2-query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj w ~2,7 mln orzeczeń…"
            maxLength={1000}
            className="min-w-0 flex-1 border border-[color:var(--rule-strong)] bg-[color:var(--parchment)] px-4 py-3 text-base text-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none"
          />
          <EditorialButton type="submit" loading={mutation.isPending} disabled={!query.trim()}>
            <Search className="h-4 w-4" aria-hidden />
            Szukaj
          </EditorialButton>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
              Rodzaj sądu
            </span>
            <select
              value={courtType}
              onChange={(e) => setCourtType(e.target.value)}
              className={fieldClass}
            >
              {COURT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
              Data od
            </span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
              Data do
            </span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>
      </form>

      {mutation.isPending && (
        <p role="status" className="text-center text-sm text-[color:var(--ink-soft)]">
          Przeszukuję pełną bazę…
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

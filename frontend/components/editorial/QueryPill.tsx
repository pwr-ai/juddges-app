import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface QueryPillProps {
  href: string;
  children: React.ReactNode;
  /** Optional language tag (`PL`, `EN`) shown in the pill. */
  lang?: string;
  className?: string;
}

/**
 * Editorial query pill — newsprint-style suggestion link. Replaces the
 * generic rounded card pill used in hero demo-query rows.
 *
 * @example
 *   <QueryPill href="/search?q=…" lang="PL">Frankowicze i abuzywne klauzule</QueryPill>
 */
export function QueryPill({ href, children, lang, className }: QueryPillProps) {
  return (
    <Link
      href={href}
      className={cn("editorial-pill group", className)}
    >
      {lang && (
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--ink-soft)] group-hover:text-[color:var(--oxblood)]">
          {lang}
        </span>
      )}
      <span>{children}</span>
      <span aria-hidden className="text-[color:var(--ink-soft)] group-hover:text-[color:var(--oxblood)]">
        →
      </span>
    </Link>
  );
}

export default QueryPill;

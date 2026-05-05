/**
 * Static publication data for the publications page.
 */

import type { Publication, PublicationType } from "@/types/publication";

export const publications: Publication[] = [];

/**
 * Sort publications by year descending, then by title.
 */
export function sortPublications(pubs: Publication[], sortBy?: string): Publication[] {
  return [...pubs].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "year_asc") return a.year - b.year;
    // Default: year descending, then title
    if (b.year !== a.year) return b.year - a.year;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Get unique years from publications list.
 */
export function getPublicationYears(pubs: Publication[]): number[] {
  const years = new Set(pubs.map((p) => p.year));
  return Array.from(years).sort((a, b) => b - a);
}

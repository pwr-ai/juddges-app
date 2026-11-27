import type { Publication } from "@/types/publication";

/**
 * Sort catalog publications by year descending, then by title.
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

import { cn } from "@/lib/utils";
import type { Publication } from "@/lib/project-content";

const externalLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

const textLinkClass =
  "text-[color:var(--oxblood)] underline underline-offset-4 hover:text-[color:var(--oxblood-deep)]";

/**
 * One verified publication from `lib/project-content.ts`, linking out to its
 * canonical URL. Shared by the landing page and `/publications` (#762).
 */
export function PublicationItem({ publication }: { publication: Publication }) {
  return (
    <li className="py-5 border-b border-[color:var(--rule)]">
      <a
        href={publication.url}
        className={cn("font-serif text-lg", textLinkClass)}
        {...externalLinkProps}
      >
        {publication.title}
      </a>
      <p className="mt-1 text-[15px] text-[color:var(--ink-soft)]">
        {publication.authors}
      </p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
        {publication.venue} · {publication.year}
      </p>
    </li>
  );
}

export function PublicationList({
  publications,
}: {
  publications: Publication[];
}) {
  return (
    <ul>
      {publications.map((publication) => (
        <PublicationItem key={publication.url} publication={publication} />
      ))}
    </ul>
  );
}

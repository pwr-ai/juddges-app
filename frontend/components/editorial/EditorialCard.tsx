import React from "react";
import { cn } from "@/lib/utils";

interface EditorialCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Section eyebrow / kicker label. */
  eyebrow?: React.ReactNode;
  /** Card title — rendered with the editorial display face. */
  title?: React.ReactNode;
  /** Optional right-side header slot — usually a "View all →" link. */
  action?: React.ReactNode;
  /** Make the card clickable (adds hover lift). */
  clickable?: boolean;
  /** Disable the top ink rule. */
  flat?: boolean;
  /** Increase emphasis — adds a small oxblood corner mark. */
  featured?: boolean;
  /** Hide the bordered shell entirely. */
  bare?: boolean;
}

/**
 * Editorial card — sharp paper edges, an ink rule across the top, and an
 * optional eyebrow + serif title header. The body is whatever children pass.
 *
 * Replaces the round-cornered glassmorphism BaseCard pattern across the app
 * for surfaces that should feel like printed paper rather than glass.
 *
 * @example
 *   <EditorialCard eyebrow="Database" title="Comprehensive coverage" action={<Link>View all</Link>}>
 *     ...
 *   </EditorialCard>
 */
export function EditorialCard({
  eyebrow,
  title,
  action,
  clickable = false,
  flat = false,
  featured = false,
  bare = false,
  className,
  children,
  ...props
}: EditorialCardProps) {
  return (
    <div
      data-clickable={clickable ? "true" : undefined}
      className={cn(
        bare
          ? "bg-transparent"
          : flat
            ? "bg-[color:var(--card)] border border-[color:var(--rule)]"
            : "editorial-card",
        "relative flex flex-col p-5 sm:p-6",
        clickable && "cursor-pointer",
        className,
      )}
      {...props}
    >
      {featured && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-px left-0 h-[2px] w-12 bg-[color:var(--oxblood)]"
        />
      )}
      {(eyebrow || title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            {eyebrow && (
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
                {eyebrow}
              </span>
            )}
            {title && (
              <h3 className="font-serif text-xl sm:text-2xl leading-[1.1] tracking-[-0.01em] text-[color:var(--ink)]">
                {title}
              </h3>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export default EditorialCard;
